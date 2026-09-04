import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

function projectInWorkspace(projectId, workspaceId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, workspaceId);
}

function sectionInWorkspace(sectionId, workspaceId) {
  return db.prepare(
    `SELECT s.* FROM sections s JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND p.workspace_id = ?`
  ).get(sectionId, workspaceId);
}

router.get('/', (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }
  res.json(db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY sort_order').all(projectId));
});

router.post('/', (req, res) => {
  const { project_id, name } = req.body || {};
  const projectId = Number(project_id);
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM sections WHERE project_id = ?').get(projectId).m ?? -1;
  const info = db.prepare('INSERT INTO sections (project_id, name, sort_order) VALUES (?, ?, ?)').run(projectId, name.trim(), maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM sections WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = sectionInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  const { name, sort_order } = req.body || {};
  const fields = [];
  const values = [];
  if (name !== undefined && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE sections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json(db.prepare('SELECT * FROM sections WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = sectionInWorkspace(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Section not found' });
  db.prepare('DELETE FROM sections WHERE id = ?').run(id); // tasks.section_id -> NULL via FK
  res.json({ ok: true });
});

export default router;
