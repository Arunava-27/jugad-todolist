import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM assignees WHERE workspace_id = ? ORDER BY name').all(req.workspaceId));
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO assignees (workspace_id, name) VALUES (?, ?)').run(req.workspaceId, name.trim());
    res.status(201).json(db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Assignee already exists' });
    }
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignees WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Assignee not found' });
  const { name, color } = req.body || {};
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (fields.length) {
    values.push(id);
    try {
      db.prepare(`UPDATE assignees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'An assignee with that name already exists' });
      throw e;
    }
  }
  res.json(db.prepare('SELECT * FROM assignees WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM assignees WHERE id = ? AND workspace_id = ?').get(Number(req.params.id), req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Assignee not found' });
  db.prepare('DELETE FROM assignees WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

export default router;
