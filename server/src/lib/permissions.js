// Workspace role hierarchy: viewer < member < admin < owner.
// A site admin (users.role === 'admin') is treated as an owner of every
// workspace for permission purposes, same as elsewhere in the app.
import db from '../db/index.js';

const RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function roleFor(user, workspaceId) {
  if (user.role === 'admin') return 'owner';
  const m = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, user.id);
  return m?.role || null;
}

export function atLeast(role, min) {
  return (RANK[role] ?? -1) >= (RANK[min] ?? 99);
}

// Middleware factory: requires requireWorkspace to have already run (needs
// req.workspaceRole). Use for member/invite management and workspace
// settings that a plain member/viewer shouldn't be able to touch.
export function requireWorkspaceRole(min) {
  return (req, res, next) => {
    if (!atLeast(req.workspaceRole, min)) {
      return res.status(403).json({ error: `Only a workspace ${min === 'admin' ? 'owner or admin' : min} can do that` });
    }
    next();
  };
}
