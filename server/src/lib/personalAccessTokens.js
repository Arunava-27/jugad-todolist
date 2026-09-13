import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';

// How many leading characters of a raw token are stored in the clear as
// token_prefix — mirrors the constant of the same name in
// middleware/auth.js (kept separate there deliberately; that copy is about
// looking an incoming Bearer token up, this one is about minting a new one,
// and the plan for Phase 9 was to leave middleware/auth.js untouched).
export const TOKEN_PREFIX_LEN = 12;

// The one place a personal_access_tokens row is ever created — used by the
// self-service "Create token" flow (routes/tokens.js) and by a completed
// OAuth sign-in (routes/oauth.js, Phase 9), so an OAuth-issued token is
// byte-for-byte the same shape as one a person creates by hand: same
// pat_<hex> format, same bcrypt hashing, same table. Everything downstream
// (middleware/auth.js's Bearer branch, requireWorkspace, roleFor/atLeast,
// the MCP tools) treats the two identically. `oauthClientId` stays null for
// a hand-created token; set, it's what lets the UI label "via <app name>".
export function mintPersonalAccessToken({ userId, name, expiresAt = null, oauthClientId = null }) {
  const raw = `pat_${crypto.randomBytes(24).toString('hex')}`;
  const tokenPrefix = raw.slice(0, TOKEN_PREFIX_LEN);
  const tokenHash = bcrypt.hashSync(raw, 10);

  const info = db.prepare(
    'INSERT INTO personal_access_tokens (user_id, name, token_prefix, token_hash, expires_at, oauth_client_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, tokenPrefix, tokenHash, expiresAt, oauthClientId);

  const row = db.prepare('SELECT * FROM personal_access_tokens WHERE id = ?').get(info.lastInsertRowid);
  return { raw, row };
}
