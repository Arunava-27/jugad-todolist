import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, team: user.team, organizationId: user.organization_id };
}

function myWorkspaces(userId) {
  return db.prepare(
    `SELECT w.id, w.name, wm.role as my_role
     FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(userId);
}

function slugify(name) {
  const base = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
  let slug = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

router.post('/register', (req, res) => {
  const { email, name, password, inviteToken, organizationName } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // Two ways to land here: with an invite token (joining an organization
  // someone already inside it invited you to — the frontend calls the
  // invite's own accept endpoint right after this, which is what actually
  // adds the workspace membership) or with an organization name (founding
  // a brand new organization, of which you become the owner). No workspace
  // is ever auto-created either way — only an org's owner/admin creates
  // workspaces, and assigns people into them via invites.
  let organizationId;
  let role;

  if (inviteToken) {
    const pendingInvite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(inviteToken);
    if (pendingInvite && pendingInvite.email !== cleanEmail) {
      return res.status(400).json({ error: 'This invite was sent to a different email address' });
    }
    if (!pendingInvite) return res.status(400).json({ error: 'This invite is no longer valid' });
    const workspace = db.prepare('SELECT organization_id FROM workspaces WHERE id = ?').get(pendingInvite.workspace_id);
    organizationId = workspace.organization_id;
    role = 'developer'; // base org rank for anyone joining via invite; their workspace-level role comes from the invite itself
  } else {
    const cleanOrgName = String(organizationName || '').trim();
    if (!cleanOrgName) return res.status(400).json({ error: 'Organization name is required' });
    const info = db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run(cleanOrgName, slugify(cleanOrgName));
    organizationId = info.lastInsertRowid;
    role = 'owner';
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (organization_id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(organizationId, cleanEmail, cleanName, passwordHash, role);

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
