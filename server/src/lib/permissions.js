import db from '../db/index.js';

// Five-tier role vocabulary, shared by org-level (users.role) and
// workspace-level (workspace_members.role) roles. 'manager' sits between a
// contributor and someone who can touch settings: manager can run the day
// to day work of a workspace (assign tasks, manage projects/sections/
// statuses) but — same as a developer or viewer — can't invite/remove
// people, change roles, or touch workspace settings; that stays admin+.
export const ROLES = ['owner', 'admin', 'manager', 'developer', 'viewer'];
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', manager: 'Manager', developer: 'Developer', viewer: 'Viewer' };
const RANK = { viewer: 0, developer: 1, manager: 2, admin: 3, owner: 4 };

// A user's effective role within one workspace — or null if they have none
// (not a member, or the workspace belongs to a different organization
// entirely; there is no cross-org access anywhere in the app).
export function roleFor(user, workspaceId) {
  const workspace = db.prepare('SELECT organization_id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace || workspace.organization_id !== user.organization_id) return null;

  // The org's owner has blanket access to every workspace inside their own
  // org, without needing an explicit workspace_members row — same shortcut
  // as the old single-tier "admin" role, just renamed.
  if (user.role === 'owner') return 'owner';

  const m = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, user.id);
  return m?.role || null;
}

export function atLeast(role, min) {
  return (RANK[role] ?? -1) >= (RANK[min] ?? 99);
}
