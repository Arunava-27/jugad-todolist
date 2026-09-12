import { Router } from 'express';
import db from '../db/index.js';
import { atLeast } from '../lib/permissions.js';

const router = Router();

// A workspace-wide rollup for whoever actually runs the place — project
// counts by stage, what's overdue and where, and who's carrying how much —
// gated to manager+ same as the other cross-project actions (a developer's
// or viewer's sidebar never even shows the nav entry for this).
router.get('/', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) {
    return res.status(403).json({ error: 'Only a manager, admin, or owner can see the workspace overview' });
  }

  const projectCount = db.prepare(
    'SELECT COUNT(*) c FROM projects WHERE workspace_id = ? AND is_archived = 0'
  ).get(req.workspaceId).c;

  const byStage = db.prepare(
    `SELECT COALESCE(status, 'No stage') as stage, COUNT(*) count FROM projects
     WHERE workspace_id = ? AND is_archived = 0 GROUP BY stage ORDER BY count DESC`
  ).all(req.workspaceId);

  const taskTotals = db.prepare(
    `SELECT COUNT(*) total, COALESCE(SUM(is_completed), 0) completed
     FROM tasks WHERE workspace_id = ? AND parent_task_id IS NULL`
  ).get(req.workspaceId);

  const today = new Date().toISOString().slice(0, 10);
  const overdueByProject = db.prepare(
    `SELECT p.id, p.name, COUNT(*) count FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.workspace_id = ? AND t.is_completed = 0 AND t.due_date IS NOT NULL AND t.due_date < ?
       AND t.parent_task_id IS NULL
     GROUP BY p.id ORDER BY count DESC`
  ).all(req.workspaceId, today);
  const overdueTotal = overdueByProject.reduce((sum, p) => sum + p.count, 0);

  const byPerson = db.prepare(
    `SELECT u.id, u.name, COUNT(*) count FROM task_members tm
     JOIN tasks t ON t.id = tm.task_id JOIN users u ON u.id = tm.user_id
     WHERE t.workspace_id = ? AND t.is_completed = 0 AND t.parent_task_id IS NULL
     GROUP BY u.id ORDER BY count DESC`
  ).all(req.workspaceId);

  res.json({
    project_count: projectCount,
    by_stage: byStage,
    task_total: taskTotals.total,
    task_completed: taskTotals.completed,
    overdue_total: overdueTotal,
    overdue_by_project: overdueByProject,
    by_person: byPerson,
  });
});

export default router;
