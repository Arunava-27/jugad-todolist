import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM labels WHERE workspace_id = ? ORDER BY sort_order').all(req.workspaceId));
});

router.post('/', (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM labels WHERE workspace_id = ?').get(req.workspaceId).m ?? -1;
  try {
    const info = db.prepare('INSERT INTO labels (workspace_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(req.workspaceId, name.trim(), color || '#94a3b8', maxOrder + 1);
    res.status(201).json(db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Label already exists' });
    }
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Label not found' });
  const { name, color, sort_order } = req.body || {};
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length) {
    values.push(id);
    try {
      db.prepare(`UPDATE labels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A label with that name already exists' });
      throw e;
    }
  }
  res.json(db.prepare('SELECT * FROM labels WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM labels WHERE id = ? AND workspace_id = ?').get(Number(req.params.id), req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Label not found' });
  db.prepare('DELETE FROM labels WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

export default router;
