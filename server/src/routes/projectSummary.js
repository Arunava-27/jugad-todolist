import { Router } from 'express';
import db from '../db/index.js';
import { roleFor } from '../lib/permissions.js';

const router = Router();

// A deliberately narrow, read-only view of one project: enough for a
// stakeholder to see where things stand (stage, dates, progress, who's on
// it) without full task-level detail (titles, descriptions, attachments).
// Reachable by a project_stakeholders row alone — no workspace membership
// required — which is the whole point: a stakeholder is scoped to specific
// projects they care about, not the workspace. A normal workspace member
// can hit this too (roleFor fallback) for the same summary, just as a
// convenience; it's not their primary way of working with the project.
router.get('/:projectId', (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const isStakeholder = !!db.prepare('SELECT 1 FROM project_stakeholders WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  const hasWorkspaceAccess = !!roleFor(req.user, project.workspace_id);
  if (!isStakeholder && !hasWorkspaceAccess) return res.status(403).json({ error: "You don't have access to this project" });

  const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(project.workspace_id);

  const counts = db.prepare(
    `SELECT COUNT(*) total, COALESCE(SUM(is_completed), 0) completed
     FROM tasks WHERE project_id = ? AND parent_task_id IS NULL`
  ).get(projectId);

  const byStatus = db.prepare(
    `SELECT status, COUNT(*) count FROM tasks WHERE project_id = ? AND parent_task_id IS NULL GROUP BY status ORDER BY count DESC`
  ).all(projectId);

  const team = db.prepare(
    `SELECT DISTINCT u.id, u.name FROM task_members tm
     JOIN tasks t ON t.id = tm.task_id JOIN users u ON u.id = tm.user_id
     WHERE t.project_id = ? ORDER BY u.name COLLATE NOCASE`
  ).all(projectId);

  res.json({
    id: project.id,
    name: project.name,
    status: project.status,
    description: project.description,
    start_date: project.start_date,
    target_date: project.target_date,
    is_archived: !!project.is_archived,
    workspace_name: workspace?.name || null,
    task_count: counts.total,
    completed_count: counts.completed,
    by_status: byStatus,
    team,
  });
});

export default router;
