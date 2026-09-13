import { Router } from 'express';
import db from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';

const router = Router();

function projectInWorkspace(projectId, workspaceId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, workspaceId);
}

function teamInWorkspace(teamId, workspaceId) {
  return db.prepare(
    `SELECT t.* FROM teams t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.workspace_id = ?`
  ).get(teamId, workspaceId);
}

function hydrateTeam(team) {
  const members = db.prepare(
    `SELECT u.id, u.name, u.email, d.name as domain_name, d.color as domain_color
     FROM team_members tm JOIN users u ON u.id = tm.user_id LEFT JOIN domains d ON d.id = u.domain_id
     WHERE tm.team_id = ? ORDER BY u.name COLLATE NOCASE`
  ).all(team.id);
  return { ...team, members };
}

router.get('/', (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }
  const rows = db.prepare('SELECT * FROM teams WHERE project_id = ? ORDER BY sort_order').all(projectId);
  res.json(rows.map(hydrateTeam));
});

router.post('/', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can create a team' });

  const { project_id, name, color } = req.body || {};
  const projectId = Number(project_id);
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }

  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM teams WHERE project_id = ?').get(projectId).m ?? -1;
  try {
    const info = db.prepare(
      'INSERT INTO teams (project_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(projectId, name.trim(), color || '#6366f1', maxOrder + 1);
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(hydrateTeam(row));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A team with that name already exists on this project' });
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = teamInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can edit a team' });

  const { name, color, sort_order } = req.body || {};
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length) {
    values.push(id);
    try {
      db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A team with that name already exists on this project' });
      throw e;
    }
  }
  res.json(hydrateTeam(db.prepare('SELECT * FROM teams WHERE id = ?').get(id)));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = teamInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a team' });
  db.prepare('DELETE FROM teams WHERE id = ?').run(id); // team_members cascade
  res.json({ ok: true });
});

router.get('/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const existing = teamInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  res.json(hydrateTeam(existing).members);
});

// A deliberate single-add action — unlike a task's bulk member-list save
// (setTaskMembers, which silently drops a stale id), adding one specific
// person to a team gets an explicit error if they're not actually eligible,
// since the manager picked them on purpose and should know if it failed.
router.post('/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const existing = teamInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can add someone to a team' });

  const userId = Number(req.body?.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !roleFor(user, req.workspaceId)) {
    return res.status(400).json({ error: 'That person is not a member of this workspace' });
  }
  db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)').run(id, userId);
  res.status(201).json(hydrateTeam(db.prepare('SELECT * FROM teams WHERE id = ?').get(id)));
});

router.delete('/:id/members/:userId', (req, res) => {
  const id = Number(req.params.id);
  const existing = teamInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can remove someone from a team' });
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(id, Number(req.params.userId));
  res.json(hydrateTeam(db.prepare('SELECT * FROM teams WHERE id = ?').get(id)));
});

export default router;
