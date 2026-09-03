import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const rows = db.prepare(
    `SELECT * FROM projects ${includeArchived ? '' : 'WHERE is_archived = 0'} ORDER BY name COLLATE NOCASE`
  ).all();
  const counts = db.prepare(
    `SELECT project_id, COUNT(*) as total, SUM(is_completed) as completed
     FROM tasks GROUP BY project_id`
  ).all();
  const countMap = Object.fromEntries(counts.map((c) => [c.project_id, c]));
  res.json(rows.map((p) => ({
    ...p,
    is_archived: !!p.is_archived,
    task_count: countMap[p.id]?.total || 0,
    completed_count: countMap[p.id]?.completed || 0,
  })));
});

router.post('/', (req, res) => {
  const { name, status, platform, description, version, build_number, start_date, target_date, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const stmt = db.prepare(
    `INSERT INTO projects (name, status, platform, description, version, build_number, start_date, target_date, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    name.trim(), status || null, platform || null, description || null,
    version || null, build_number || null, start_date || null, target_date || null,
    color || '#6366f1'
  );
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const fields = ['name', 'status', 'platform', 'description', 'version', 'build_number', 'start_date', 'target_date', 'color', 'is_archived'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (f in (req.body || {})) {
      updates.push(`${f} = ?`);
      values.push(f === 'is_archived' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (updates.length === 0) return res.json(existing);
  values.push(id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(id); // tasks.project_id -> NULL via FK
  res.json({ ok: true });
});

export default router;
