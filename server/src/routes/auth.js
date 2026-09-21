import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyCredentials } from '../lib/credentials.js';
import { createSession, revokeSession, revokeSessionByToken, revokeAllSessionsForUser, listActiveSessions } from '../lib/sessions.js';
import { createAuthToken, consumeAuthToken } from '../lib/authTokens.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { generateTotpSecret, totpUri, verifyTotpCode, generateRecoveryCodes, consumeRecoveryCode } from '../lib/totp.js';
import { secretEncryptionConfigured, encryptSecretValue, decryptSecretValue } from '../lib/secretCrypto.js';

const router = Router();

// Every login attempt here is either a real success or a genuinely worth-
// throttling failure (wrong password, unknown email) — unlike a general
// app route, there's no ordinary-use case that should be hammering this one
// dozens of times a minute, so a broad per-IP limit is safe here in a way it
// wouldn't be for most other routes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again later.' },
});

// Shares the same reasoning as loginLimiter above — a normal user hits
// "resend verification" or "forgot password" a handful of times at most.
const emailActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again later.' },
});

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// A pending 2FA login is "I proved the password, now prove the device" — this
// in-memory map (not a DB table) holds that intermediate state for a few
// minutes only. Same single-instance-deployment tradeoff as
// middleware/auth.js's failedPatAttempts map: it resets on a process
// restart, which just means an in-flight 2FA login has to restart from the
// password step — an acceptable cost for not needing a table (and cleanup
// job) for something this short-lived.
const PENDING_2FA_TTL_MS = 5 * 60 * 1000;
const pending2fa = new Map(); // pendingToken -> { userId, expiresAt }

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organization_id,
    emailVerified: !!user.email_verified_at,
    twoFactorEnabled: !!user.totp_enabled_at,
  };
}

function myWorkspaces(userId) {
  return db.prepare(
    `SELECT w.id, w.name, wm.role as my_role
     FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ? ORDER BY w.name COLLATE NOCASE`
  ).all(userId);
}

// Projects this user has stakeholder (read-only, high-level) access to —
// independent of workspace membership, see routes/projectSummary.js.
function myStakeholderProjects(userId) {
  return db.prepare(
    `SELECT p.id, p.name, p.workspace_id, w.name as workspace_name
     FROM project_stakeholders ps JOIN projects p ON p.id = ps.project_id JOIN workspaces w ON w.id = p.workspace_id
     WHERE ps.user_id = ? ORDER BY p.name COLLATE NOCASE`
  ).all(userId);
}

function slugify(name) {
  const base = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
  let slug = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

// Establishes a real signed-in session for `user` — used by register, the
// no-2FA branch of login, and the final step of a 2FA login. Puts the
// server-side session's opaque token (never the userId itself) in the
// cookie; see lib/sessions.js and middleware/auth.js for how it's resolved
// back on later requests.
function signIn(req, user) {
  const { raw } = createSession({ userId: user.id, userAgent: req.header('User-Agent'), ip: req.ip });
  req.session.sid = raw;
}

router.post('/register', async (req, res) => {
  const { email, name, password, inviteToken, organizationName } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // Two ways to land here: with an invite token (joining an organization
  // someone already inside it invited you to — the frontend calls the
  // invite's own accept endpoint right after this, which is what actually
  // adds the workspace membership) or with an organization name (founding
  // a brand new organization, of which you become the owner). No workspace
  // is ever auto-created either way — only an org's owner/admin creates
  // workspaces, and assigns people into them via invites.
  let organizationId;
  let role;

  if (inviteToken) {
    const pendingInvite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(inviteToken);
    if (pendingInvite && pendingInvite.email !== cleanEmail) {
      return res.status(400).json({ error: 'This invite was sent to a different email address' });
    }
    if (!pendingInvite) return res.status(400).json({ error: 'This invite is no longer valid' });
    const workspace = db.prepare('SELECT organization_id FROM workspaces WHERE id = ?').get(pendingInvite.workspace_id);
    organizationId = workspace.organization_id;
    role = 'developer'; // base org rank for anyone joining via invite; their workspace-level role comes from the invite itself
  } else {
    const cleanOrgName = String(organizationName || '').trim();
    if (!cleanOrgName) return res.status(400).json({ error: 'Organization name is required' });
    const info = db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run(cleanOrgName, slugify(cleanOrgName));
    organizationId = info.lastInsertRowid;
    role = 'owner';
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (organization_id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(organizationId, cleanEmail, cleanName, passwordHash, role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  signIn(req, user);

  const verifyToken = createAuthToken(user.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
  const emailResult = await sendVerificationEmail({ to: cleanEmail, name: cleanName, token: verifyToken });

  res.status(201).json({
    user: publicUser(user),
    workspaces: myWorkspaces(user.id),
    stakeholderProjects: myStakeholderProjects(user.id),
    emailSent: emailResult.sent,
    verifyLink: emailResult.sent ? undefined : emailResult.link,
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const user = verifyCredentials(req.body?.email, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.totp_enabled_at) {
    const pendingToken = crypto.randomBytes(24).toString('hex');
    pending2fa.set(pendingToken, { userId: user.id, expiresAt: Date.now() + PENDING_2FA_TTL_MS });
    return res.json({ twoFactorRequired: true, pendingToken });
  }

  signIn(req, user);
  res.json({ user: publicUser(user), workspaces: myWorkspaces(user.id), stakeholderProjects: myStakeholderProjects(user.id) });
});

router.post('/2fa/login', loginLimiter, (req, res) => {
  const { pendingToken, code } = req.body || {};
  const pending = pending2fa.get(pendingToken);
  if (!pending || pending.expiresAt < Date.now()) {
    pending2fa.delete(pendingToken);
    return res.status(401).json({ error: 'This sign-in attempt has expired — log in again' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pending.userId);
  if (!user || !user.is_active || !user.totp_enabled_at) {
    pending2fa.delete(pendingToken);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const secret = decryptSecretValue(user.totp_secret);
  let ok = verifyTotpCode(secret, code);

  if (!ok) {
    const storedCodes = user.totp_recovery_codes ? JSON.parse(user.totp_recovery_codes) : [];
    const updated = consumeRecoveryCode(storedCodes, code);
    if (updated) {
      db.prepare('UPDATE users SET totp_recovery_codes = ? WHERE id = ?').run(JSON.stringify(updated), user.id);
      ok = true;
    }
  }

  if (!ok) return res.status(401).json({ error: 'Invalid code' });

  pending2fa.delete(pendingToken);
  signIn(req, user);
  res.json({ user: publicUser(user), workspaces: myWorkspaces(user.id), stakeholderProjects: myStakeholderProjects(user.id) });
});

router.post('/logout', (req, res) => {
  revokeSessionByToken(req.session?.sid);
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), workspaces: myWorkspaces(req.user.id), stakeholderProjects: myStakeholderProjects(req.user.id) });
});

// --- email verification ---

router.get('/verify-email/:token', (req, res) => {
  const row = consumeAuthToken(req.params.token, 'verify_email');
  if (!row) return res.status(410).json({ error: 'This verification link is invalid or has expired' });
  db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(new Date().toISOString(), row.user_id);
  res.json({ ok: true });
});

router.post('/verify-email/resend', requireAuth, emailActionLimiter, async (req, res) => {
  if (req.user.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
  const verifyToken = createAuthToken(req.user.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
  const emailResult = await sendVerificationEmail({ to: req.user.email, name: req.user.name, token: verifyToken });
  res.json({ ok: true, emailSent: emailResult.sent, verifyLink: emailResult.sent ? undefined : emailResult.link });
});

// --- password reset ---
// Deliberately responds identically (status, body) whether or not the email
// belongs to an account, and never echoes a reset link back — see
// lib/email.js's sendPasswordResetEmail comment for why.

router.post('/password-reset/request', emailActionLimiter, async (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const user = cleanEmail ? db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) : null;
  if (user) {
    const resetToken = createAuthToken(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    await sendPasswordResetEmail({ to: user.email, name: user.name, token: resetToken });
  }
  res.json({ ok: true });
});

router.post('/password-reset/:token', (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const row = consumeAuthToken(req.params.token, 'password_reset');
  if (!row) return res.status(410).json({ error: 'This reset link is invalid or has expired' });

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.user_id);
  revokeAllSessionsForUser(row.user_id); // force re-login everywhere, including whoever just reset it

  res.json({ ok: true });
});

// --- sessions ---

router.get('/sessions', requireAuth, (req, res) => {
  const sessions = listActiveSessions(req.user.id).map((s) => ({ ...s, current: s.id === req.sessionRow.id }));
  res.json(sessions);
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  revokeSession(id);
  if (req.sessionRow.id === id) req.session = null; // revoking your own current session also signs you out here
  res.json({ ok: true });
});

router.post('/sessions/revoke-others', requireAuth, (req, res) => {
  revokeAllSessionsForUser(req.user.id, { exceptId: req.sessionRow.id });
  res.json({ ok: true });
});

// --- two-factor authentication ---

router.post('/2fa/setup', requireAuth, async (req, res) => {
  if (!secretEncryptionConfigured()) {
    return res.status(500).json({ error: 'Two-factor authentication is not available — an admin needs to set SECRET_MASTER_KEY on this server.' });
  }
  if (req.user.totp_enabled_at) return res.status(409).json({ error: 'Two-factor authentication is already enabled' });

  const secret = generateTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(encryptSecretValue(secret), req.user.id);

  const uri = totpUri(secret, req.user.email);
  const qrDataUri = await QRCode.toDataURL(uri);
  res.json({ secret, uri, qrDataUri });
});

router.post('/2fa/enable', requireAuth, (req, res) => {
  if (req.user.totp_enabled_at) return res.status(409).json({ error: 'Two-factor authentication is already enabled' });
  if (!req.user.totp_secret) return res.status(400).json({ error: 'Start setup first' });

  const secret = decryptSecretValue(req.user.totp_secret);
  if (!verifyTotpCode(secret, req.body?.code)) return res.status(400).json({ error: 'Invalid code' });

  const { codes, hashes } = generateRecoveryCodes();
  db.prepare('UPDATE users SET totp_enabled_at = ?, totp_recovery_codes = ? WHERE id = ?')
    .run(new Date().toISOString(), JSON.stringify(hashes), req.user.id);

  res.json({ ok: true, recoveryCodes: codes });
});

router.post('/2fa/disable', requireAuth, (req, res) => {
  if (!req.user.totp_enabled_at) return res.status(409).json({ error: 'Two-factor authentication is not enabled' });
  if (!bcrypt.compareSync(String(req.body?.password || ''), req.user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_recovery_codes = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default router;
