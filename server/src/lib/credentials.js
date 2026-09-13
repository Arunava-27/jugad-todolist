import bcrypt from 'bcryptjs';
import db from '../db/index.js';

// The one place a Punchlist password is ever checked — used by the normal
// JSON login endpoint (routes/auth.js) and by the OAuth authorization page's
// login form (routes/oauth.js, Phase 9), so there's exactly one
// bcrypt.compareSync call site for credentials in the whole app rather than
// two that could quietly drift apart. Returns the full user row on success,
// or null — deliberately generic either way (unknown email, wrong password,
// and a deactivated account all return null), so nothing here leaks which
// one it was.
export function verifyCredentials(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return null;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) return null;
  return user;
}
