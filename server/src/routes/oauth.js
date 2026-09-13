import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import db from '../db/index.js';
import { APP_URL } from '../lib/appUrl.js';
import { verifyCredentials } from '../lib/credentials.js';
import { mintPersonalAccessToken, TOKEN_PREFIX_LEN } from '../lib/personalAccessTokens.js';

// A minimal OAuth 2.1-style authorization server — Dynamic Client
// Registration (RFC 7591) + Authorization Code + PKCE (RFC 7636) only, no
// client secrets, since every app that connects to Punchlist this way
// (Claude Desktop, claude.ai, Claude Code) is a "public" client with nowhere
// secret to keep one. It exists purely as a friendlier front door onto the
// Phase 7 personal-access-token system: a completed sign-in here just mints
// an ordinary personal_access_tokens row (see lib/personalAccessTokens.js),
// so requireAuth/requireWorkspace/roleFor/atLeast and every MCP tool need no
// changes at all — an OAuth-issued token is indistinguishable downstream
// from one a person creates by hand in Settings → Connectors.
//
// These routes are reachable without being signed in (that's the point —
// they're how you *get* signed in), so none of them sit behind requireAuth.
// GET/POST /oauth/authorize instead check req.session directly, the same
// cookie requireAuth's own cookie branch reads.

const router = Router();
// Scoped to this router only — no other route in the app parses form-
// encoded bodies. A JSON body (e.g. some clients' DCR POST) is already
// handled by the app-level express.json() before it reaches here; this only
// kicks in for requests actually carrying application/x-www-form-urlencoded.
router.use(express.urlencoded({ extended: false }));

// Same shape/reasoning as auth.js's loginLimiter: every legitimate use of
// these endpoints is infrequent (register a client once per app install,
// sign in once per grant, refresh occasionally), so a broad per-IP limit is
// safe here in a way it wouldn't be for an ordinary app route.
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later.' },
});

const ACCESS_TOKEN_TTL_DAYS = 30;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

function isAllowedRedirectUri(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    // Loopback is the standard exception for native/CLI clients (e.g. a
    // desktop app or Claude Code spinning up a temporary local callback).
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Discovery (RFC 9728 protected-resource metadata, RFC 8414 authorization-
// server metadata) — what lets a client that only knows the /mcp URL find
// its way to /oauth/register and /oauth/authorize on its own.
// ---------------------------------------------------------------------------

router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: `${APP_URL}/mcp`,
    authorization_servers: [APP_URL],
  });
});

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/oauth/authorize`,
    token_endpoint: `${APP_URL}/oauth/token`,
    registration_endpoint: `${APP_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
});

// ---------------------------------------------------------------------------
// Dynamic Client Registration (RFC 7591) — the exact step that used to fail
// ("Couldn't register with Jugad-Todolist's sign-in service") before this
// phase existed, since Punchlist had no registration_endpoint at all.
// ---------------------------------------------------------------------------

router.post('/oauth/register', oauthLimiter, (req, res) => {
  const clientName = String(req.body?.client_name || 'Unnamed app').trim().slice(0, 200) || 'Unnamed app';
  const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];

  if (redirectUris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
  }
  const badUri = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
  if (badUri) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `${badUri} is not an allowed redirect URI (must be https, or http://localhost for a native client)` });
  }

  const id = `client_${crypto.randomBytes(16).toString('hex')}`;
  db.prepare('INSERT INTO oauth_clients (id, client_name, redirect_uris) VALUES (?, ?, ?)')
    .run(id, clientName, JSON.stringify(redirectUris));

  res.status(201).json({
    client_id: id,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
});

// ---------------------------------------------------------------------------
// Authorization endpoint — a small, deliberately server-rendered login +
// consent page. This is the one place in the whole app that sends HTML
// instead of JSON (everything else is API + the React SPA) — the same way
// GitHub's or Google's OAuth consent screens are separate from their main
// app UI, this is a pre-auth bootstrap step with nowhere in the SPA (which
// has no client-side router) to naturally live instead.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Punchlist</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1220; color: #e7e9f5; padding: 24px; }
  .card { width: 100%; max-width: 380px; background: #171b2e; border: 1px solid #2a3050; border-radius: 12px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  .brand { font-weight: 700; font-size: 13px; letter-spacing: .08em; color: #d9a02a; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p.sub { color: #9aa2c0; font-size: 13px; line-height: 1.5; margin: 0 0 20px; }
  label { display: block; font-size: 12px; color: #9aa2c0; margin: 14px 0 5px; }
  input[type=email], input[type=password] { width: 100%; padding: 10px 12px; border-radius: 7px;
    border: 1px solid #2a3050; background: #0f1220; color: #e7e9f5; font-size: 14px; }
  input:focus { outline: 2px solid #d9a02a; outline-offset: 1px; }
  .actions { display: flex; gap: 10px; margin-top: 22px; }
  button { flex: 1; padding: 10px 14px; border-radius: 7px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
  button.primary { background: #d9a02a; color: #241a02; }
  button.ghost { background: transparent; color: #9aa2c0; border: 1px solid #2a3050; }
  button:focus-visible { outline: 2px solid #d9a02a; outline-offset: 2px; }
  .error { background: #3a1620; border: 1px solid #6b2436; color: #ff9baa; font-size: 13px; padding: 10px 12px; border-radius: 7px; margin-bottom: 16px; }
  .client { font-weight: 600; color: #e7e9f5; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">PUNCHLIST</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function hiddenFields(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n');
}

function loginPageHtml({ params, error, loginEmail }) {
  return `
    <h1>Sign in</h1>
    <p class="sub">Sign in to your Punchlist account to continue connecting <span class="client">${escapeHtml(params.client_name || 'this app')}</span>.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/oauth/authorize">
      ${hiddenFields(params)}
      <input type="hidden" name="step" value="login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" value="${escapeHtml(loginEmail || '')}" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <div class="actions">
        <button type="submit" class="primary">Sign in</button>
      </div>
    </form>
  `;
}

function consentPageHtml({ params, client, user }) {
  return `
    <h1>Allow access?</h1>
    <p class="sub"><span class="client">${escapeHtml(client.client_name)}</span> wants to connect to your Punchlist account as <strong>${escapeHtml(user.email)}</strong>. It will be able to act through your existing role and permissions — nothing more, and you can revoke this anytime from Settings → Connectors.</p>
    <form method="post" action="/oauth/authorize">
      ${hiddenFields(params)}
      <input type="hidden" name="step" value="consent">
      <div class="actions">
        <button type="submit" name="decision" value="deny" class="ghost">Deny</button>
        <button type="submit" name="decision" value="allow" class="primary">Allow</button>
      </div>
    </form>
  `;
}

function errorPageHtml(message) {
  return `<h1>Can't connect</h1><p class="sub">${escapeHtml(message)}</p>`;
}

function extractAuthorizeParams(source) {
  return {
    response_type: source.response_type,
    client_id: source.client_id,
    redirect_uri: source.redirect_uri,
    code_challenge: source.code_challenge,
    code_challenge_method: source.code_challenge_method,
    state: source.state,
    scope: source.scope,
  };
}

// Validates client_id/redirect_uri BEFORE anything is allowed to redirect —
// per OAuth guidance, a request with an unknown client or a redirect_uri
// that doesn't match what that client registered must be shown as an
// in-page error, never redirected, since the redirect_uri itself is exactly
// what's unverified at that point (an open-redirect risk otherwise).
function validateClientAndRedirect(params) {
  if (!params.client_id) return { error: 'Missing client_id.' };
  const client = db.prepare('SELECT * FROM oauth_clients WHERE id = ?').get(params.client_id);
  if (!client) return { error: 'Unknown client. It may need to register again.' };
  let redirectUris = [];
  try { redirectUris = JSON.parse(client.redirect_uris); } catch { /* leave empty */ }
  if (!params.redirect_uri || !redirectUris.includes(params.redirect_uri)) {
    return { error: "This app's redirect address doesn't match what it registered." };
  }
  return { client };
}

function getSessionUser(req) {
  const userId = req.session?.userId;
  if (!userId) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return user && user.is_active ? user : null;
}

// Once client_id/redirect_uri are confirmed valid, later problems (bad
// PKCE, denied consent) redirect back to the client with a standard OAuth
// error rather than being shown in-page — the client is expected to handle these.
function redirectWithError(res, redirectUri, state, error) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
}

router.get('/oauth/authorize', (req, res) => {
  const params = extractAuthorizeParams(req.query);
  const { client, error } = validateClientAndRedirect(params);
  if (error) return res.status(400).send(renderPage('Connect', errorPageHtml(error)));

  if (params.response_type !== 'code' || !params.code_challenge || params.code_challenge_method !== 'S256') {
    return redirectWithError(res, params.redirect_uri, params.state, 'invalid_request');
  }

  const withClientName = { ...params, client_name: client.client_name };
  const sessionUser = getSessionUser(req);
  const html = sessionUser
    ? renderPage('Allow access', consentPageHtml({ params: withClientName, client, user: sessionUser }))
    : renderPage('Sign in', loginPageHtml({ params: withClientName }));
  res.send(html);
});

router.post('/oauth/authorize', oauthLimiter, (req, res) => {
  const params = extractAuthorizeParams(req.body || {});
  const { client, error } = validateClientAndRedirect(params);
  if (error) return res.status(400).send(renderPage('Connect', errorPageHtml(error)));

  if (params.response_type !== 'code' || !params.code_challenge || params.code_challenge_method !== 'S256') {
    return redirectWithError(res, params.redirect_uri, params.state, 'invalid_request');
  }

  const withClientName = { ...params, client_name: client.client_name };
  const step = req.body?.step;

  if (step === 'login') {
    const user = verifyCredentials(req.body?.email, req.body?.password);
    if (!user) {
      return res.status(401).send(renderPage('Sign in', loginPageHtml({
        params: withClientName, error: 'Invalid email or password', loginEmail: req.body?.email,
      })));
    }
    // Signing in here also signs the browser into Punchlist itself (the
    // same req.session.userId the normal /api/auth/login sets) — a person
    // approving a connector while already logged out ends up logged in
    // afterward too, which is the expected behavior for this kind of page.
    req.session.userId = user.id;
    return res.send(renderPage('Allow access', consentPageHtml({ params: withClientName, client, user })));
  }

  if (step === 'consent') {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.send(renderPage('Sign in', loginPageHtml({ params: withClientName })));
    }
    if (req.body?.decision !== 'allow') {
      return redirectWithError(res, params.redirect_uri, params.state, 'access_denied');
    }

    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();
    db.prepare(
      `INSERT INTO oauth_authorization_codes
        (code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(code, client.id, sessionUser.id, params.redirect_uri, params.code_challenge, params.code_challenge_method, expiresAt);

    const redirectUrl = new URL(params.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) redirectUrl.searchParams.set('state', params.state);
    return res.redirect(redirectUrl.toString());
  }

  res.status(400).send(renderPage('Connect', errorPageHtml('Invalid request.')));
});

// ---------------------------------------------------------------------------
// Token endpoint — exchanges a redeemed authorization code, or an existing
// refresh token, for a fresh { access_token, refresh_token } pair. The
// access_token is always a real personal_access_tokens row (see
// lib/personalAccessTokens.js) — nothing new for middleware/auth.js's
// Bearer branch to learn.
// ---------------------------------------------------------------------------

function issueTokenPair({ user, client }) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { raw: accessToken, row: patRow } = mintPersonalAccessToken({
    userId: user.id,
    name: `${client.client_name} (OAuth)`,
    expiresAt,
    oauthClientId: client.id,
  });

  const rawRefresh = `rtk_${crypto.randomBytes(32).toString('hex')}`;
  const refreshPrefix = rawRefresh.slice(0, TOKEN_PREFIX_LEN);
  const refreshHash = bcrypt.hashSync(rawRefresh, 10);
  db.prepare(
    'INSERT INTO oauth_refresh_tokens (token_prefix, token_hash, client_id, user_id, pat_id) VALUES (?, ?, ?, ?, ?)'
  ).run(refreshPrefix, refreshHash, client.id, user.id, patRow.id);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60,
    refresh_token: rawRefresh,
  };
}

function handleAuthCodeGrant(req, res) {
  const code = req.body?.code;
  const redirectUri = req.body?.redirect_uri;
  const clientId = req.body?.client_id;
  const codeVerifier = req.body?.code_verifier;
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const authCode = db.prepare('SELECT * FROM oauth_authorization_codes WHERE code = ?').get(code);
  if (!authCode || authCode.used_at || authCode.client_id !== clientId || authCode.redirect_uri !== redirectUri
    || new Date(authCode.expires_at) < new Date()) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  const expectedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  if (expectedChallenge !== authCode.code_challenge) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
  }

  // Mark used immediately, before minting anything — a code can only ever
  // be redeemed once, so this is the replay guard.
  db.prepare('UPDATE oauth_authorization_codes SET used_at = ? WHERE code = ?').run(new Date().toISOString(), code);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(authCode.user_id);
  const client = db.prepare('SELECT * FROM oauth_clients WHERE id = ?').get(clientId);
  if (!user || !user.is_active || !client) return res.status(400).json({ error: 'invalid_grant' });

  res.json(issueTokenPair({ user, client }));
}

function handleRefreshGrant(req, res) {
  const rawRefresh = req.body?.refresh_token;
  const clientId = req.body?.client_id;
  if (!rawRefresh || !clientId) return res.status(400).json({ error: 'invalid_request' });

  const prefix = rawRefresh.slice(0, TOKEN_PREFIX_LEN);
  const candidates = db.prepare(
    'SELECT * FROM oauth_refresh_tokens WHERE token_prefix = ? AND client_id = ? AND revoked_at IS NULL'
  ).all(prefix, clientId);
  const match = candidates.find((c) => bcrypt.compareSync(rawRefresh, c.token_hash));
  if (!match) return res.status(400).json({ error: 'invalid_grant' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(match.user_id);
  const client = db.prepare('SELECT * FROM oauth_clients WHERE id = ?').get(clientId);
  if (!user || !user.is_active || !client) return res.status(400).json({ error: 'invalid_grant' });

  // Rotation: this refresh token and the access token it was paired with
  // are both retired the instant they're used, then a fresh pair is minted.
  // A stolen refresh token replayed after the legitimate client already
  // rotated it finds itself revoked here and fails — the theft-detection
  // signal rotation is meant to provide.
  const now = new Date().toISOString();
  db.prepare('UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE id = ?').run(now, match.id);
  if (match.pat_id) {
    db.prepare('UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, match.pat_id);
  }

  res.json(issueTokenPair({ user, client }));
}

router.post('/oauth/token', oauthLimiter, (req, res) => {
  const grantType = req.body?.grant_type;
  if (grantType === 'authorization_code') return handleAuthCodeGrant(req, res);
  if (grantType === 'refresh_token') return handleRefreshGrant(req, res);
  res.status(400).json({ error: 'unsupported_grant_type' });
});

export default router;
