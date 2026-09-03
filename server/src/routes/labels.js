import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM labels ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO labels (name, color) VALUES (?, ?)').run(name.trim(), color || '#94a3b8');
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
  const existing = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Label not found' });
  const { name, color } = req.body || {};
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
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
  db.prepare('DELETE FROM labels WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
