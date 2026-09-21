import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';
import { resolveSession } from '../lib/sessions.js';

// How many leading characters of a raw token are stored in the clear as
// token_prefix, for display ("pat_ab12••••") and as a lookup index — this
// narrows the bcrypt.compareSync candidates to (in practice) zero or one row
// instead of scanning every live token on every request.
const TOKEN_PREFIX_LEN = 12;

// A minimal, in-process limiter on FAILED Bearer-token lookups specifically
// (not general 401s/403s from normal app use, which would be too broad and
// would end up throttling legitimate users hitting ordinary permission
// boundaries). In-memory is fine for this single-container deployment — see
// the roadmap plan's Phase 7 security notes. Resets on process restart,
// which is an acceptable tradeoff for what this guards against (a leaked or
// guessed token prefix being brute-forced over the network).
const FAILED_PAT_LIMIT = 20;
const FAILED_PAT_WINDOW_MS = 15 * 60 * 1000;
const failedPatAttempts = new Map(); // ip -> { count, resetAt }

function tooManyFailedPatAttempts(ip) {
  const entry = failedPatAttempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= FAILED_PAT_LIMIT;
}
function recordFailedPatAttempt(ip) {
  const now = Date.now();
  const entry = failedPatAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    failedPatAttempts.set(ip, { count: 1, resetAt: now + FAILED_PAT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

// Resolves a request to req.user two ways: the normal signed session cookie
// (the browser app), or an `Authorization: Bearer <token>` header (a script,
// an MCP client, etc. acting as one specific person via their own personal
// access token — see routes/tokens.js). Either path lands on an identical
// req.user, so every downstream permission check (roleFor/atLeast,
// requireWorkspace) behaves exactly the same regardless of how the caller
// authenticated — a PAT never has broader reach than that person's session.
export function requireAuth(req, res, next) {
  const bearer = req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return authenticateViaToken(bearer, req, res, next);

  const sid = req.session?.sid;
  if (!sid) return res.status(401).json({ error: 'Not authenticated' });
  const resolved = resolveSession(sid);
  if (!resolved) {
    req.session = null;
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = resolved.user;
  req.sessionRow = resolved.session;
  next();
}

function authenticateViaToken(token, req, res, next) {
  const ip = req.ip;
  if (tooManyFailedPatAttempts(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts — try again later.' });
  }

  const prefix = token.slice(0, TOKEN_PREFIX_LEN);
  const candidates = db.prepare(
    'SELECT * FROM personal_access_tokens WHERE token_prefix = ? AND revoked_at IS NULL'
  ).all(prefix);
  const match = candidates.find((c) => bcrypt.compareSync(token, c.token_hash));

  if (!match || (match.expires_at && new Date(match.expires_at) < new Date())) {
    recordFailedPatAttempt(ip);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(match.user_id);
  if (!user || !user.is_active) {
    recordFailedPatAttempt(ip);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Throttled write — only touch last_used_at if it's stale by more than a
  // few minutes, so a script calling the API repeatedly doesn't turn every
  // single request into an extra UPDATE.
  if (!match.last_used_at || Date.now() - new Date(match.last_used_at).getTime() > 5 * 60 * 1000) {
    db.prepare('UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), match.id);
  }

  req.user = user;
  req.authMethod = 'pat';
  req.patId = match.id;
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
