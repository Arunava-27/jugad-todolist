import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { seedDefaultWorkflow } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function myWorkspaces(userId) {
  return db.prepare(
    `SELECT w.id, w.name, wm.role as my_role
     FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(userId);
}

router.post('/register', (req, res) => {
  const { email, name, password, workspaceName, inviteToken } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // Registering via an invite link joins that workspace instead of getting
  // a personal one auto-created — the invite's own accept endpoint (called
  // by the frontend right after this) does the actual joining, this just
  // skips creating a workspace nobody asked for.
  let pendingInvite = null;
  if (inviteToken) {
    pendingInvite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(inviteToken);
    if (pendingInvite && pendingInvite.email !== cleanEmail) {
      return res.status(400).json({ error: 'This invite was sent to a different email address' });
    }
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db.transaction(() => {
    const userInfo = db.prepare(
      'INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(cleanEmail, cleanName, passwordHash, 'member');
    const userId = userInfo.lastInsertRowid;

    if (!pendingInvite) {
      const wsInfo = db.prepare('INSERT INTO workspaces (name, created_by) VALUES (?, ?)')
        .run((workspaceName && workspaceName.trim()) || `${cleanName}'s Workspace`, userId);
      const workspaceId = wsInfo.lastInsertRowid;
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, 'owner');
      seedDefaultWorkflow(workspaceId);
    }

    return userId;
  })();

  req.session.userId = result;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result);
  res.status(201).json({ user: publicUser(user), workspaces: myWorkspaces(result) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user), workspaces: myWorkspaces(user.id) });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), workspaces: myWorkspaces(req.user.id) });
});

export default router;
