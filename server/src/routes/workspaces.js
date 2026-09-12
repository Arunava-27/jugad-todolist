import { Router } from 'express';
import crypto from 'node:crypto';
import db, { seedDefaultWorkflow } from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';
import { sendInviteEmail } from '../lib/email.js';

const router = Router();

const INVITE_TTL_DAYS = 7;
const VALID_INVITE_ROLES = ['admin', 'manager', 'developer', 'viewer']; // never 'owner' via invite

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
  // Only the org's owner creates workspaces — everyone else gets assigned
  // into one by the owner (an invite, or being added by an existing
  // account's email) rather than spinning up their own.
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Only the organization owner can create a workspace' });

  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const workspaceId = db.transaction(() => {
    const info = db.prepare('INSERT INTO workspaces (organization_id, name, created_by) VALUES (?, ?, ?)').run(req.user.organization_id, name, req.user.id);
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
  if (!atLeast(roleFor(req.user, id), 'admin')) return res.status(403).json({ error: 'Only a workspace owner or admin can do that' });

  const name = (req.body?.name || '').trim();
  if (name) db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id);
  res.json(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  // Deleting the workspace itself is owner-only — more permanent than
  // anything an admin should be able to do unilaterally.
  if (!atLeast(roleFor(req.user, id), 'owner')) return res.status(403).json({ error: 'Only a workspace owner can delete it' });

  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id); // members/projects/tasks/invites/etc cascade
  res.json({ ok: true });
});

router.get('/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const role = roleFor(req.user, id);
  if (!role) return res.status(403).json({ error: 'Not a member of this workspace' });

  const members = db.prepare(
    `SELECT u.id, u.name, u.email, wm.role
     FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? ORDER BY wm.role = 'owner' DESC, wm.role = 'admin' DESC, u.name COLLATE NOCASE`
  ).all(id);

  const invites = db.prepare(
    `SELECT id, email, role, created_at, expires_at FROM invites
     WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at DESC`
  ).all(id);

  res.json({ members, invites });
});

// Adds an existing user immediately, or creates + emails a pending invite
// for an address with no account yet.
router.post('/:id/members', async (req, res) => {
  const id = Number(req.params.id);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!atLeast(roleFor(req.user, id), 'admin')) return res.status(403).json({ error: 'Only a workspace owner or admin can invite people' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = VALID_INVITE_ROLES.includes(req.body?.role) ? req.body.role : 'developer';
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) {
    if (user.organization_id !== workspace.organization_id) {
      return res.status(409).json({ error: 'That email already belongs to an account in a different organization' });
    }
    const existing = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, user.id);
    if (existing) return res.status(409).json({ error: 'Already a member' });
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(id, user.id, role);
    return res.status(201).json({ status: 'added', member: { id: user.id, name: user.name, email: user.email, role } });
  }

  // No account yet — (re)issue a pending invite and email it.
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const existingInvite = db.prepare("SELECT * FROM invites WHERE workspace_id = ? AND email = ? AND status = 'pending'").get(id, email);
  if (existingInvite) {
    db.prepare('UPDATE invites SET role = ?, token = ?, invited_by = ?, expires_at = ?, created_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?')
      .run(role, token, req.user.id, expiresAt, existingInvite.id);
  } else {
    db.prepare('INSERT INTO invites (workspace_id, email, role, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, role, token, req.user.id, expiresAt);
  }

  const result = await sendInviteEmail({ to: email, inviterName: req.user.name, workspaceName: workspace.name, token });
  res.status(201).json({ status: 'invited', email, role, emailSent: result.sent, inviteLink: result.sent ? undefined : result.link });
});

router.patch('/:id/members/:userId', (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const myRole = roleFor(req.user, id);
  const target = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, targetUserId);
  if (!target) return res.status(404).json({ error: 'Not a member of this workspace' });

  const newRole = req.body?.role;
  if (!['owner', 'admin', 'manager', 'developer', 'viewer'].includes(newRole)) return res.status(400).json({ error: 'Invalid role' });

  // Only an owner can promote to/demote from owner; admins can otherwise
  // manage member/viewer/admin.
  const touchesOwnership = target.role === 'owner' || newRole === 'owner';
  if (!atLeast(myRole, touchesOwnership ? 'owner' : 'admin')) {
    return res.status(403).json({ error: 'Only a workspace owner can change an owner’s role' });
  }

  if (target.role === 'owner' && newRole !== 'owner') {
    const ownerCount = db.prepare("SELECT COUNT(*) c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'").get(id).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'Workspace needs at least one owner' });
  }

  db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?').run(newRole, id, targetUserId);
  res.json({ ok: true });
});

router.delete('/:id/members/:userId', (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const isSelf = targetUserId === req.user.id;
  const myRole = roleFor(req.user, id);
  if (!isSelf && !atLeast(myRole, 'admin')) {
    return res.status(403).json({ error: 'Only a workspace owner or admin can remove other members' });
  }

  const target = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(id, targetUserId);
  if (target?.role === 'owner') {
    if (!isSelf && !atLeast(myRole, 'owner')) return res.status(403).json({ error: 'Only a workspace owner can remove an owner' });
    const ownerCount = db.prepare("SELECT COUNT(*) c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'").get(id).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'Workspace needs at least one owner' });
  }

  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(id, targetUserId);
  res.json({ ok: true });
});

router.delete('/:id/invites/:inviteId', (req, res) => {
  const id = Number(req.params.id);
  const inviteId = Number(req.params.inviteId);
  if (!atLeast(roleFor(req.user, id), 'admin')) return res.status(403).json({ error: 'Only a workspace owner or admin can revoke an invite' });

  const invite = db.prepare('SELECT * FROM invites WHERE id = ? AND workspace_id = ?').get(inviteId, id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  db.prepare("UPDATE invites SET status = 'revoked' WHERE id = ?").run(inviteId);
  res.json({ ok: true });
});

export default router;
