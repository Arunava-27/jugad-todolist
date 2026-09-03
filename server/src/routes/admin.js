import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/users', (req, res) => {
  const rows = db.prepare(
    `SELECT id, email, name, role, is_active, created_at,
       (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = users.id) as workspace_count
     FROM users ORDER BY created_at`
  ).all();
  res.json(rows);
});

router.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { role, is_active } = req.body || {};
  if (id === req.user.id && (role === 'member' || is_active === false)) {
    return res.status(400).json({ error: "You can't demote or deactivate your own account" });
  }

  const fields = [];
  const values = [];
  if (role !== undefined) { fields.push('role = ?'); values.push(role === 'admin' ? 'admin' : 'member'); }
  if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  const { password_hash, ...safe } = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(safe);
});

router.get('/workspaces', (req, res) => {
  const rows = db.prepare(
    `SELECT w.id, w.name, w.created_at,
       (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id = w.id) as task_count
     FROM workspaces w ORDER BY w.name COLLATE NOCASE`
  ).all();
  res.json(rows);
});

export default router;
