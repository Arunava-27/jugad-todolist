import crypto from 'node:crypto';
import db from '../db/index.js';

// How long a session lives before it needs a fresh login — matches the
// cookie's own maxAge in app.js's cookie-session config; keep the two in
// sync (the cookie is useless once the server-side row it points at expires,
// and vice versa).
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// The one place a `sessions` row is created — on register and on a
// successful login (including the final step of a 2FA login). Returns the
// raw token (goes in the cookie, never stored) and the row (goes nowhere
// sensitive — id/timestamps only).
export function createSession({ userId, userAgent, ip }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();
  const info = db.prepare(
    'INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, hashToken(raw), userAgent || null, ip || null, expiresAt);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid);
  return { raw, row };
}

// Resolves the cookie's `sid` to a live session + user, or null if it's
// missing, revoked, or expired — mirrors middleware/auth.js's PAT lookup
// shape (authenticateViaToken), just keyed by exact hash instead of a
// prefix+bcrypt scan, since this runs on every request and needs to stay
// fast (see schema.sql's comment on sessions.token_hash for why SHA-256).
export function resolveSession(rawToken) {
  if (!rawToken) return null;
  const session = db.prepare(
    'SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL'
  ).get(hashToken(rawToken));
  if (!session || new Date(session.expires_at) < new Date()) return null;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user || !user.is_active) return null;

  // Throttled write, same reasoning as personal_access_tokens.last_used_at
  // in middleware/auth.js: only touch last_seen_at if it's stale by more
  // than a few minutes, so ordinary browsing doesn't turn into a write on
  // every single request.
  if (Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60 * 1000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), session.id);
  }

  return { session, user };
}

export function revokeSession(id) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), id);
}

export function revokeSessionByToken(rawToken) {
  if (!rawToken) return;
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), hashToken(rawToken));
}

// Used after a password reset (force re-login everywhere) and available for
// a self-service "sign out everywhere else" action. exceptId lets the
// caller's own current session survive the sweep for the latter case.
export function revokeAllSessionsForUser(userId, { exceptId = null } = {}) {
  if (exceptId) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), userId, exceptId);
  } else {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), userId);
  }
}

export function listActiveSessions(userId) {
  return db.prepare(
    `SELECT id, user_agent, ip, created_at, last_seen_at FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`
  ).all(userId, new Date().toISOString());
}
