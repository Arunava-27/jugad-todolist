import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function getPendingInvite(token) {
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token);
  if (!invite) return { invite: null, reason: 'not_found' };
  if (invite.status === 'accepted') return { invite, reason: 'accepted' };
  if (invite.status === 'revoked') return { invite, reason: 'revoked' };
  if (new Date(invite.expires_at) < new Date()) return { invite, reason: 'expired' };
  return { invite, reason: null };
}

// Public: lets the accept-invite screen show who invited whom to what,
// and whether the invited email already has an account (so the frontend
// knows whether to show a login form or a registration form), before the
// visitor is authenticated at all.
router.get('/:token', (req, res) => {
  const { invite, reason } = getPendingInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (reason) return res.status(410).json({ error: `This invite has been ${reason}`, status: reason });

  const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(invite.workspace_id);
  const inviter = db.prepare('SELECT name FROM users WHERE id = ?').get(invite.invited_by);
  const accountExists = !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(invite.email);

  res.json({
    email: invite.email,
    role: invite.role,
    workspaceName: workspace?.name || 'a workspace',
    inviterName: inviter?.name || 'Someone',
    accountExists,
  });
});

// Requires the caller to already be authenticated (via the normal login or
// register endpoints, which the frontend drives first) as the exact user
// the invite was addressed to.
router.post('/:token/accept', requireAuth, (req, res) => {
  const { invite, reason } = getPendingInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (reason) return res.status(410).json({ error: `This invite has been ${reason}`, status: reason });

  if (invite.email !== req.user.email) {
    return res.status(403).json({ error: `This invite was sent to ${invite.email}, not ${req.user.email}` });
  }

  const existing = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(invite.workspace_id, req.user.id);
  db.transaction(() => {
    if (!existing) {
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(invite.workspace_id, req.user.id, invite.role);
    }
    db.prepare("UPDATE invites SET status = 'accepted', accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(invite.id);
  })();

  const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(invite.workspace_id);
  res.json({ workspace });
});

export default router;
