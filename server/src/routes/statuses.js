import { Router } from 'express';
import db from '../db/index.js';
import { atLeast } from '../lib/permissions.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM statuses WHERE workspace_id = ? ORDER BY sort_order').all(req.workspaceId));
});

router.post('/', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can add a status' });
  const { name, color, is_done } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM statuses WHERE workspace_id = ?').get(req.workspaceId).m ?? -1;
  try {
    const info = db.prepare(
      'INSERT INTO statuses (workspace_id, name, color, sort_order, is_done) VALUES (?, ?, ?, ?, ?)'
    ).run(req.workspaceId, name.trim(), color || '#94a3b8', maxOrder + 1, is_done ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM statuses WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A status with that name already exists' });
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM statuses WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Status not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can edit a status' });
  const { name, color, sort_order, is_done, is_default } = req.body || {};

  const run = db.transaction(() => {
    if (name !== undefined && name.trim() && name.trim() !== existing.name) {
      const clash = db.prepare('SELECT id FROM statuses WHERE workspace_id = ? AND name = ? AND id != ?').get(req.workspaceId, name.trim(), id);
      if (clash) throw Object.assign(new Error('A status with that name already exists'), { status: 409 });
      db.prepare('UPDATE tasks SET status = ? WHERE workspace_id = ? AND status = ?').run(name.trim(), req.workspaceId, existing.name);
    }
    if (is_default) {
      db.prepare('UPDATE statuses SET is_default = 0 WHERE workspace_id = ? AND id != ?').run(req.workspaceId, id);
    }
    const fields = [];
    const values = [];
    if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (is_done !== undefined) { fields.push('is_done = ?'); values.push(is_done ? 1 : 0); }
    if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }
    if (fields.length) {
      values.push(id);
      db.prepare(`UPDATE statuses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  });

  try {
    run();
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: e.message });
    throw e;
  }
  res.json(db.prepare('SELECT * FROM statuses WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM statuses WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Status not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a status' });

  const inUse = db.prepare('SELECT COUNT(*) c FROM tasks WHERE workspace_id = ? AND status = ?').get(req.workspaceId, existing.name).c;
  const reassignTo = req.query.reassign_to;

  if (inUse > 0 && !reassignTo) {
    return res.status(409).json({ error: 'Status is in use by tasks', count: inUse });
  }
  if (inUse > 0 && reassignTo) {
    const target = db.prepare('SELECT 1 FROM statuses WHERE workspace_id = ? AND name = ? AND id != ?').get(req.workspaceId, reassignTo, id);
    if (!target) return res.status(400).json({ error: 'reassign_to must be the name of an existing status' });
  }
  const total = db.prepare('SELECT COUNT(*) c FROM statuses WHERE workspace_id = ?').get(req.workspaceId).c;
  if (total <= 1) return res.status(400).json({ error: 'At least one status must remain' });

  const run = db.transaction(() => {
    if (inUse > 0 && reassignTo) {
      db.prepare('UPDATE tasks SET status = ? WHERE workspace_id = ? AND status = ?').run(reassignTo, req.workspaceId, existing.name);
    }
    db.prepare('DELETE FROM statuses WHERE id = ?').run(id);
    if (existing.is_default) {
      const next = db.prepare('SELECT id FROM statuses WHERE workspace_id = ? ORDER BY sort_order LIMIT 1').get(req.workspaceId);
      if (next) db.prepare('UPDATE statuses SET is_default = 1 WHERE id = ?').run(next.id);
    }
  });
  run();
  res.json({ ok: true });
});

export default router;
