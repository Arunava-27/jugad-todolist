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
    `SELECT u.id, u.email, u.name, u.role, u.domain_id, d.name as domain_name, d.color as domain_color,
       u.weekly_capacity_hours, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = u.id) as workspace_count
     FROM users u LEFT JOIN domains d ON d.id = u.domain_id
     WHERE u.organization_id = ? ORDER BY u.created_at`
  ).all(req.user.organization_id);
  res.json(rows);
});

// --- domains (structured discipline list: Frontend, Backend, QA, DevOps, ...) ---

router.get('/domains', (req, res) => {
  res.json(db.prepare('SELECT * FROM domains WHERE organization_id = ? ORDER BY sort_order').all(req.user.organization_id));
});

router.post('/domains', (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM domains WHERE organization_id = ?').get(req.user.organization_id).m ?? -1;
  try {
    const info = db.prepare(
      'INSERT INTO domains (organization_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(req.user.organization_id, name.trim(), color || '#94a3b8', maxOrder + 1);
    res.status(201).json(db.prepare('SELECT * FROM domains WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A domain with that name already exists' });
    throw e;
  }
});

router.patch('/domains/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM domains WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Domain not found' });
  const { name, color, sort_order } = req.body || {};

  if (name !== undefined && name.trim() && name.trim() !== existing.name) {
    const clash = db.prepare('SELECT id FROM domains WHERE organization_id = ? AND name = ? AND id != ?').get(req.user.organization_id, name.trim(), id);
    if (clash) return res.status(409).json({ error: 'A domain with that name already exists' });
  }
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE domains SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json(db.prepare('SELECT * FROM domains WHERE id = ?').get(id));
});

router.delete('/domains/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM domains WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Domain not found' });

  const inUse = db.prepare('SELECT COUNT(*) c FROM users WHERE domain_id = ?').get(id).c;
  const reassignTo = req.query.reassign_to; // another domain's name, resolved to id below

  if (inUse > 0 && !reassignTo) {
    return res.status(409).json({ error: 'Domain is in use by people', count: inUse });
  }

  const run = db.transaction(() => {
    if (inUse > 0 && reassignTo) {
      const target = db.prepare('SELECT id FROM domains WHERE organization_id = ? AND name = ?').get(req.user.organization_id, reassignTo);
      if (!target) throw Object.assign(new Error('Reassignment domain not found'), { status: 400 });
      db.prepare('UPDATE users SET domain_id = ? WHERE domain_id = ?').run(target.id, id);
    }
    db.prepare('DELETE FROM domains WHERE id = ?').run(id);
  });
  try {
    run();
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }
  res.json({ ok: true });
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

  const { role, is_active, domain_id, weekly_capacity_hours } = req.body || {};
  if (id === req.user.id && is_active === false) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  if (id === req.user.id && role !== undefined && role !== req.user.role) {
    return res.status(400).json({ error: "You can't change your own role" });
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (domain_id !== undefined && domain_id !== null) {
    const domain = db.prepare('SELECT 1 FROM domains WHERE id = ? AND organization_id = ?').get(domain_id, req.user.organization_id);
    if (!domain) return res.status(400).json({ error: 'Domain not found' });
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
  if (domain_id !== undefined) { fields.push('domain_id = ?'); values.push(domain_id || null); }
  if (weekly_capacity_hours !== undefined) {
    const n = weekly_capacity_hours === null || weekly_capacity_hours === '' ? null : Number(weekly_capacity_hours);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return res.status(400).json({ error: 'Capacity must be a positive number of hours' });
    fields.push('weekly_capacity_hours = ?'); values.push(n);
  }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  const { password_hash, ...safe } = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(safe);
});

router.delete('/users/:id', (req, res) => {
  // Deleting an account is permanent and irreversible (unlike deactivating,
  // which any admin+ can already do) — restricted to the organization's
  // owner only, never an admin, no matter how the request is crafted.
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete a user' });

  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });

  const target = db.prepare('SELECT * FROM users WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // The existence/ownership checks above and the delete below run as one
  // atomic unit — the last-owner check in particular must see the same
  // count it deletes against. Cascades: workspace_members (removed),
  // invites and workspaces (kept, invited_by/created_by set to NULL) —
  // and, less obviously, task_members and project_stakeholders (both also
  // ON DELETE CASCADE — see schema.sql), which silently unassign this
  // person from every task and revoke every stakeholder grant they had.
  // The task side of that gets an activity-log entry below, written before
  // the cascade fires, so a task's own history doesn't go quiet right where
  // an account disappearing matters most.
  let blocked = null;
  db.transaction(() => {
    if (target.role === 'owner') {
      const ownerCount = db.prepare("SELECT COUNT(*) c FROM users WHERE organization_id = ? AND role = 'owner'").get(req.user.organization_id).c;
      if (ownerCount <= 1) { blocked = 'The organization needs at least one owner'; return; }
    }
    const assignedTaskIds = db.prepare('SELECT task_id FROM task_members WHERE user_id = ?').all(id).map((r) => r.task_id);
    const logRemoval = db.prepare('INSERT INTO task_activity (task_id, user_id, type, meta) VALUES (?, ?, ?, ?)');
    for (const taskId of assignedTaskIds) {
      logRemoval.run(taskId, req.user.id, 'assignee_removed', JSON.stringify({ name: target.name, reason: 'account_deleted' }));
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();

  if (blocked) return res.status(400).json({ error: blocked });
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
