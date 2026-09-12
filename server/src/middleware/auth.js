import db from '../db/index.js';

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

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Reads the workspace the request applies to from the X-Workspace-Id header
// (or ?workspace_id= for convenience), and verifies req.user actually
// belongs to it — site admins may access any workspace. Must run after
// requireAuth. Also attaches req.workspaceRole ('owner'|'admin'|'member'|
// 'viewer') and blocks any non-GET request from a viewer, since that role
// is read-only across every workspace-scoped route mounted behind this
// middleware.
export function requireWorkspace(req, res, next) {
  const raw = req.header('X-Workspace-Id') || req.query.workspace_id;
  const workspaceId = Number(raw);
  if (!raw || !Number.isInteger(workspaceId)) {
    return res.status(400).json({ error: 'Missing or invalid X-Workspace-Id' });
  }
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  let role;
  if (req.user.role === 'admin') {
    role = 'owner';
  } else {
    const membership = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Not a member of this workspace' });
    role = membership.role;
  }

  if (role === 'viewer' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });
  }

  req.workspaceId = workspaceId;
  req.workspace = workspace;
  req.workspaceRole = role;
  next();
}
