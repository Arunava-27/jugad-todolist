import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { atLeast } from '../lib/permissions.js';
import { sendInviteEmail } from '../lib/email.js';

const INVITE_TTL_DAYS = 7;

const router = Router();

router.get('/', (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const rows = db.prepare(
    `SELECT * FROM projects WHERE workspace_id = ? ${includeArchived ? '' : 'AND is_archived = 0'} ORDER BY sort_order`
  ).all(req.workspaceId);
  const counts = db.prepare(
    `SELECT project_id, COUNT(*) as total, SUM(is_completed) as completed
     FROM tasks WHERE workspace_id = ? AND parent_task_id IS NULL GROUP BY project_id`
  ).all(req.workspaceId);
  const countMap = Object.fromEntries(counts.map((c) => [c.project_id, c]));
  res.json(rows.map((p) => ({
    ...p,
    is_archived: !!p.is_archived,
    is_favorite: !!p.is_favorite,
    task_count: countMap[p.id]?.total || 0,
    completed_count: countMap[p.id]?.completed || 0,
  })));
});

router.post('/', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can create a project' });

  const { name, status, platform, description, version, build_number, start_date, target_date, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM projects WHERE workspace_id = ?').get(req.workspaceId).m ?? -1;
  const stmt = db.prepare(
    `INSERT INTO projects (workspace_id, name, status, platform, description, version, build_number, start_date, target_date, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    req.workspaceId, name.trim(), status || null, platform || null, description || null,
    version || null, build_number || null, start_date || null, target_date || null,
    color || '#6366f1', maxOrder + 1
  );
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can edit a project' });

  const fields = ['name', 'status', 'platform', 'description', 'version', 'build_number', 'start_date', 'target_date', 'color', 'is_archived', 'is_favorite', 'sort_order'];
  const boolFields = new Set(['is_archived', 'is_favorite']);
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (f in (req.body || {})) {
      updates.push(`${f} = ?`);
      values.push(boolFields.has(f) ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (updates.length === 0) return res.json(existing);
  values.push(id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a project' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(id); // tasks.project_id -> NULL via FK
  res.json({ ok: true });
});

// --- project-scoped stakeholders: read-only, high-level visibility into ONE
// project, granted to a person who need not be (and often isn't) a member of
// the workspace at all — see server/src/routes/projectSummary.js for what
// they actually get to see. Managing who has that access is manager+, same
// tier that already runs a project's day-to-day.

function requireProject(req, res) {
  const id = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return null; }
  return project;
}

router.get('/:id/stakeholders', (req, res) => {
  const project = requireProject(req, res);
  if (!project) return;
  const rows = db.prepare(
    `SELECT u.id, u.name, u.email FROM project_stakeholders ps JOIN users u ON u.id = ps.user_id
     WHERE ps.project_id = ? ORDER BY u.name COLLATE NOCASE`
  ).all(project.id);
  res.json(rows);
});

// Adds an existing org account immediately, or — same shape as inviting a
// workspace member (see workspaces.js) — creates + emails a pending invite
// for an address with no account yet. Accepting that invite (which the
// register/login flow drives, same as any other invite) grants stakeholder
// access to exactly this project, NOT workspace membership; see
// invites.js's project_id branch.
router.post('/:id/stakeholders', async (req, res) => {
  const project = requireProject(req, res);
  if (!project) return;
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can add stakeholders' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) {
    if (user.organization_id !== req.workspace.organization_id) {
      return res.status(409).json({ error: 'That email already belongs to an account in a different organization' });
    }
    db.prepare('INSERT OR IGNORE INTO project_stakeholders (project_id, user_id) VALUES (?, ?)').run(project.id, user.id);
    return res.status(201).json({ status: 'added', stakeholder: { id: user.id, name: user.name, email: user.email } });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const existingInvite = db.prepare("SELECT * FROM invites WHERE project_id = ? AND email = ? AND status = 'pending'").get(project.id, email);
  if (existingInvite) {
    db.prepare('UPDATE invites SET token = ?, invited_by = ?, expires_at = ?, created_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?')
      .run(token, req.user.id, expiresAt, existingInvite.id);
  } else {
    db.prepare('INSERT INTO invites (workspace_id, project_id, email, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(project.workspace_id, project.id, email, token, req.user.id, expiresAt);
  }

  const result = await sendInviteEmail({ to: email, inviterName: req.user.name, workspaceName: project.name, token });
  res.status(201).json({ status: 'invited', email, emailSent: result.sent, inviteLink: result.sent ? undefined : result.link });
});

router.delete('/:id/stakeholders/:userId', (req, res) => {
  const project = requireProject(req, res);
  if (!project) return;
  const isSelf = Number(req.params.userId) === req.user.id;
  if (!isSelf && !atLeast(req.workspaceRole, 'manager')) {
    return res.status(403).json({ error: 'Only a manager, admin, or owner can remove stakeholders' });
  }
  db.prepare('DELETE FROM project_stakeholders WHERE project_id = ? AND user_id = ?').run(project.id, Number(req.params.userId));
  res.json({ ok: true });
});

export default router;
