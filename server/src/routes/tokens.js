import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';

const TOKEN_PREFIX_LEN = 12;
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

const router = Router();

function status(row) {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  return 'active';
}

function publicToken(row) {
  return {
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    status: status(row),
  };
}

// Account-scoped, not workspace-scoped — a token belongs to a person, not a
// workspace (a person may belong to several). Self-service: any
// authenticated user manages their own tokens, no role gate — a Developer
// should be just as able to connect their own Claude as a manager.

router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM personal_access_tokens WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(rows.map(publicToken));
});

router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  let expiresAt = null;
  if (req.body?.expires_in_days !== undefined && req.body.expires_in_days !== null) {
    const days = Number(req.body.expires_in_days);
    if (!Number.isFinite(days) || days <= 0 || days > MAX_EXPIRY_DAYS) {
      return res.status(400).json({ error: `expires_in_days must be between 1 and ${MAX_EXPIRY_DAYS}` });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (req.body?.expires_in_days !== null) {
    // Field omitted entirely (vs. explicitly null for "never expires") —
    // default to a bounded expiry rather than silently issuing a
    // never-expiring credential, since this token lives inside a
    // third-party system outside Punchlist's own control.
    expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }

  const raw = `pat_${crypto.randomBytes(24).toString('hex')}`;
  const tokenPrefix = raw.slice(0, TOKEN_PREFIX_LEN);
  const tokenHash = bcrypt.hashSync(raw, 10);

  const info = db.prepare(
    'INSERT INTO personal_access_tokens (user_id, name, token_prefix, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, name, tokenPrefix, tokenHash, expiresAt);

  const row = db.prepare('SELECT * FROM personal_access_tokens WHERE id = ?').get(info.lastInsertRowid);
  // The only time the raw value is ever returned — it isn't recoverable
  // after this response, only token_hash is kept.
  res.status(201).json({ ...publicToken(row), token: raw });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM personal_access_tokens WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Token not found' });
  if (!row.revoked_at) {
    db.prepare('UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }
  res.json({ ok: true });
});

export default router;
