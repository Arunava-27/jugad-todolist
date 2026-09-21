import crypto from 'node:crypto';
import db from '../db/index.js';

// Single-use tokens for "prove control of this email address" flows — email
// verification and password reset share this one table/module since both
// are the same shape (a token, an expiry, one use). Same SHA-256-hash-not-
// bcrypt reasoning as lib/sessions.js: these are resolved by an anonymous
// visitor clicking a link, not typed by hand, so there's no need for
// bcrypt's deliberate slowness or a prefix column.
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function createAuthToken(userId, purpose, ttlMs) {
  const raw = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(userId, purpose, hashToken(raw), expiresAt);
  return raw;
}

// Marks the token used the moment it resolves, so a second attempt with the
// same value fails even if it hasn't expired yet — same "resolve once, mark
// used" shape invites.js's accept endpoint already has for invite tokens.
export function consumeAuthToken(rawToken, purpose) {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?').get(hashToken(rawToken), purpose);
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return null;
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return row;
}
