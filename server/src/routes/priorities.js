import { Router } from 'express';
import db from '../db/index.js';
import { atLeast } from '../lib/permissions.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM priorities WHERE workspace_id = ? ORDER BY sort_order').all(req.workspaceId));
});

router.post('/', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can add a priority' });
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM priorities WHERE workspace_id = ?').get(req.workspaceId).m ?? -1;
  try {
    const info = db.prepare(
      'INSERT INTO priorities (workspace_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
    ).run(req.workspaceId, name.trim(), color || '#94a3b8', maxOrder + 1);
    res.status(201).json(db.prepare('SELECT * FROM priorities WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A priority with that name already exists' });
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM priorities WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Priority not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can edit a priority' });
  const { name, color, sort_order } = req.body || {};

  const run = db.transaction(() => {
    if (name !== undefined && name.trim() && name.trim() !== existing.name) {
      const clash = db.prepare('SELECT id FROM priorities WHERE workspace_id = ? AND name = ? AND id != ?').get(req.workspaceId, name.trim(), id);
      if (clash) throw Object.assign(new Error('A priority with that name already exists'), { status: 409 });
      db.prepare('UPDATE tasks SET priority = ? WHERE workspace_id = ? AND priority = ?').run(name.trim(), req.workspaceId, existing.name);
    }
    const fields = [];
    const values = [];
    if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length) {
      values.push(id);
      db.prepare(`UPDATE priorities SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  });

  try {
    run();
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: e.message });
    throw e;
  }
  res.json(db.prepare('SELECT * FROM priorities WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM priorities WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Priority not found' });
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a priority' });

  const inUse = db.prepare('SELECT COUNT(*) c FROM tasks WHERE workspace_id = ? AND priority = ?').get(req.workspaceId, existing.name).c;
  const reassignTo = req.query.reassign_to;

  if (inUse > 0 && !reassignTo) {
    return res.status(409).json({ error: 'Priority is in use by tasks', count: inUse });
  }
  if (inUse > 0 && reassignTo) {
    const target = db.prepare('SELECT 1 FROM priorities WHERE workspace_id = ? AND name = ? AND id != ?').get(req.workspaceId, reassignTo, id);
    if (!target) return res.status(400).json({ error: 'reassign_to must be the name of an existing priority' });
  }

  const run = db.transaction(() => {
    if (inUse > 0 && reassignTo) {
      db.prepare('UPDATE tasks SET priority = ? WHERE workspace_id = ? AND priority = ?').run(reassignTo, req.workspaceId, existing.name);
    }
    db.prepare('DELETE FROM priorities WHERE id = ?').run(id);
  });
  run();
  res.json({ ok: true });
});

export default router;
