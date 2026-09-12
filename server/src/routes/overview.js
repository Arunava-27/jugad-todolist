import { Router } from 'express';
import db from '../db/index.js';
import { atLeast } from '../lib/permissions.js';

const router = Router();

// Assumed weekly capacity for anyone who hasn't had a specific number set
// (users.weekly_capacity_hours) — a rough, editable-per-person default
// rather than a real HR setting.
const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

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

  // "Open workload" is a rough gauge, not a real capacity calculation — it
  // sums estimate_hours across every open (assigned, incomplete) task
  // regardless of due date, compared against a weekly capacity. A task with
  // no estimate contributes 0 hours but still counts toward task_count, so
  // the UI can flag when the hours figure is likely an undercount.
  const byPerson = db.prepare(
    `SELECT u.id, u.name, u.weekly_capacity_hours,
       COUNT(*) task_count,
       COALESCE(SUM(t.estimate_hours), 0) estimated_hours,
       SUM(CASE WHEN t.estimate_hours IS NULL THEN 1 ELSE 0 END) unestimated_count
     FROM task_members tm
     JOIN tasks t ON t.id = tm.task_id JOIN users u ON u.id = tm.user_id
     WHERE t.workspace_id = ? AND t.is_completed = 0 AND t.parent_task_id IS NULL
     GROUP BY u.id ORDER BY estimated_hours DESC, task_count DESC`
  ).all(req.workspaceId).map((p) => ({
    ...p,
    capacity_hours: p.weekly_capacity_hours ?? DEFAULT_WEEKLY_CAPACITY_HOURS,
  }));

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
