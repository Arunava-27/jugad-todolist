import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM priorities ORDER BY sort_order').all());
});

router.post('/', (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM priorities').get().m ?? -1;
  try {
    const info = db.prepare(
      'INSERT INTO priorities (name, color, sort_order) VALUES (?, ?, ?)'
    ).run(name.trim(), color || '#94a3b8', maxOrder + 1);
    res.status(201).json(db.prepare('SELECT * FROM priorities WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A priority with that name already exists' });
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM priorities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Priority not found' });
  const { name, color, sort_order } = req.body || {};

  const run = db.transaction(() => {
    if (name !== undefined && name.trim() && name.trim() !== existing.name) {
      const clash = db.prepare('SELECT id FROM priorities WHERE name = ? AND id != ?').get(name.trim(), id);
      if (clash) throw Object.assign(new Error('A priority with that name already exists'), { status: 409 });
      db.prepare('UPDATE tasks SET priority = ? WHERE priority = ?').run(name.trim(), existing.name);
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
  const existing = db.prepare('SELECT * FROM priorities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Priority not found' });

  const inUse = db.prepare('SELECT COUNT(*) c FROM tasks WHERE priority = ?').get(existing.name).c;
  const reassignTo = req.query.reassign_to;

  if (inUse > 0 && !reassignTo) {
    return res.status(409).json({ error: 'Priority is in use by tasks', count: inUse });
  }

  const run = db.transaction(() => {
    if (inUse > 0 && reassignTo) {
      db.prepare('UPDATE tasks SET priority = ? WHERE priority = ?').run(reassignTo, existing.name);
    }
    db.prepare('DELETE FROM priorities WHERE id = ?').run(id);
  });
  run();
  res.json({ ok: true });
});

export default router;
