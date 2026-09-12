import db from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';

export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.is_active) {
    req.session = null;
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = user;
  next();
}

// Gate for the site-wide /api/admin/* screens: the org's owner and admins
// manage the whole organization from there (users, workspaces, roles);
// manager/developer/viewer never see it.
export function requireAdmin(req, res, next) {
  if (!atLeast(req.user?.role, 'admin')) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Reads the workspace the request applies to from the X-Workspace-Id header
// (or ?workspace_id= for convenience), and verifies req.user actually
// belongs to it — the org owner may access any workspace in their own org;
// everyone else needs an explicit workspace_members row (see roleFor). Must
// run after requireAuth. Also attaches req.workspaceRole and blocks any
// non-GET request from a viewer, since that role is read-only across every
// workspace-scoped route mounted behind this middleware.
export function requireWorkspace(req, res, next) {
  const raw = req.header('X-Workspace-Id') || req.query.workspace_id;
  const workspaceId = Number(raw);
  if (!raw || !Number.isInteger(workspaceId)) {
    return res.status(400).json({ error: 'Missing or invalid X-Workspace-Id' });
  }
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const role = roleFor(req.user, workspaceId);
  if (!role) return res.status(403).json({ error: 'Not a member of this workspace' });

  if (role === 'viewer' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });
  }

  req.workspaceId = workspaceId;
  req.workspace = workspace;
  req.workspaceRole = role;
  next();
}
