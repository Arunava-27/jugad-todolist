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

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM labels WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
