import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM assignees ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO assignees (name) VALUES (?)').run(name.trim());
    res.status(201).json(db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Assignee already exists' });
    }
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM assignees WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
