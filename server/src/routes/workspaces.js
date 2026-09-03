import { Router } from 'express';
import db, { seedDefaultWorkflow } from '../db/index.js';

const router = Router();

function isManager(user, workspaceId) {
  if (user.role === 'admin') return true;
  const m = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, user.id);
  return m?.role === 'owner';
}

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT w.id, w.name, wm.role as my_role,
       (SELECT COUNT(*) FROM workspace_members m2 WHERE m2.workspace_id = w.id) as member_count
     FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const workspaceId = db.transaction(() => {
    const info = db.prepare('INSERT INTO workspaces (name, created_by) VALUES (?, ?)').run(name, req.user.id);
    const id = info.lastInsertRowid;
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'owner');
    seedDefaultWorkflow(id);
    return id;
  })();

  res.status(201).json(db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(workspaceId));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!isManager(req.user, id)) return res.status(403).json({ error: 'Only the workspace owner or an admin can do that' });

  const name = (req.body?.name || '').trim();
  if (name) db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id);
  res.json(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!isManager(req.user, id)) return res.status(403).json({ error: 'Only the workspace owner or an admin can do that' });

  const total = db.prepare('SELECT COUNT(*) c FROM workspaces').get().c;
  if (total <= 1) return res.status(400).json({ error: 'At least one workspace must remain' });

  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id); // members/projects/tasks/etc cascade
  res.json({ ok: true });
});

router.get('/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const membership = db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, req.user.id);
  if (!membership && req.user.role !== 'admin') return res.status(403).json({ error: 'Not a member of this workspace' });

  const rows = db.prepare(
    `SELECT u.id, u.name, u.email, wm.role
     FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? ORDER BY wm.role = 'owner' DESC, u.name COLLATE NOCASE`
  ).all(id);
  res.json(rows);
});

router.post('/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!isManager(req.user, id)) return res.status(403).json({ error: 'Only the workspace owner or an admin can add members' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email is required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account with that email — ask them to register first' });

  const existing = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, user.id);
  if (existing) return res.status(409).json({ error: 'Already a member' });

  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(id, user.id, 'member');
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: 'member' });
});

router.delete('/:id/members/:userId', (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const isSelf = targetUserId === req.user.id;
  if (!isSelf && !isManager(req.user, id)) {
    return res.status(403).json({ error: 'Only the workspace owner or an admin can remove other members' });
  }

  const ownerCount = db.prepare("SELECT COUNT(*) c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'").get(id).c;
  const target = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, targetUserId);
  if (target?.role === 'owner' && ownerCount <= 1) {
    return res.status(400).json({ error: 'Workspace needs at least one owner' });
  }

  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(id, targetUserId);
  res.json({ ok: true });
});

export default router;
