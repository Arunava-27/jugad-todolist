import { Router } from 'express';
import db from '../db/index.js';
import { ROLES, atLeast } from '../lib/permissions.js';

const router = Router();

router.get('/organization', (req, res) => {
  res.json(db.prepare('SELECT id, name, slug, created_at FROM organizations WHERE id = ?').get(req.user.organization_id));
});

router.patch('/organization', (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Only the owner can rename the organization' });
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(name, req.user.organization_id);
  res.json(db.prepare('SELECT id, name, slug, created_at FROM organizations WHERE id = ?').get(req.user.organization_id));
});

router.get('/users', (req, res) => {
  const rows = db.prepare(
    `SELECT id, email, name, role, team, is_active, created_at,
       (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = users.id) as workspace_count
     FROM users WHERE organization_id = ? ORDER BY created_at`
  ).all(req.user.organization_id);
  res.json(rows);
});

// All workspaces in the org, plus this one user's role in each (null where
// they aren't a member) — the "scoping" view: everything one owner/admin
// needs to add, remove, or re-role a person across every workspace at once,
// without hopping into each workspace's own Settings → Members panel.
router.get('/users/:id/memberships', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const rows = db.prepare(
    `SELECT w.id as workspace_id, w.name as workspace_name, wm.role
     FROM workspaces w LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ?
     WHERE w.organization_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(id, req.user.organization_id);
  res.json(rows);
});

router.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { role, is_active, team } = req.body || {};
  if (id === req.user.id && is_active === false) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  if (id === req.user.id && role !== undefined && role !== req.user.role) {
    return res.status(400).json({ error: "You can't change your own role" });
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  // Only an existing owner can hand out or take away the owner role.
  if (role !== undefined && (role === 'owner' || target.role === 'owner') && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can change ownership' });
  }
  if (target.role === 'owner' && role !== undefined && role !== 'owner') {
    const ownerCount = db.prepare("SELECT COUNT(*) c FROM users WHERE organization_id = ? AND role = 'owner'").get(req.user.organization_id).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'The organization needs at least one owner' });
  }

  const fields = [];
  const values = [];
  if (role !== undefined) { fields.push('role = ?'); values.push(role); }
  if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (team !== undefined) { fields.push('team = ?'); values.push(String(team).trim() || null); }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  const { password_hash, ...safe } = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(safe);
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });

  const target = db.prepare('SELECT * FROM users WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can remove another owner' });
  }
  if (target.role === 'owner') {
    const ownerCount = db.prepare("SELECT COUNT(*) c FROM users WHERE organization_id = ? AND role = 'owner'").get(req.user.organization_id).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'The organization needs at least one owner' });
  }

  // Cascades: workspace_members, invites.invited_by (SET NULL), workspaces.created_by (SET NULL).
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.get('/workspaces', (req, res) => {
  const rows = db.prepare(
    `SELECT w.id, w.name, w.created_at,
       (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id = w.id) as task_count
     FROM workspaces w WHERE w.organization_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(req.user.organization_id);
  res.json(rows);
});

export default router;
