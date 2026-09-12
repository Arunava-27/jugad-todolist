import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
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
  const { email, name, password, inviteToken } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // No workspace is ever auto-created here — only the owner (site admin)
  // creates workspaces, and assigns people into them (by role) via invites
  // or by adding an existing account's email. Registering via an invite
  // link still joins that workspace, via the invite's own accept endpoint
  // (called by the frontend right after this); registering without one
  // just creates the account, landing on the "waiting for a workspace"
  // screen until the owner adds them to one.
  if (inviteToken) {
    const pendingInvite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(inviteToken);
    if (pendingInvite && pendingInvite.email !== cleanEmail) {
      return res.status(400).json({ error: 'This invite was sent to a different email address' });
    }
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)'
  ).run(cleanEmail, cleanName, passwordHash, 'member');

  req.session.userId = info.lastInsertRowid;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user), workspaces: myWorkspaces(info.lastInsertRowid) });
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
