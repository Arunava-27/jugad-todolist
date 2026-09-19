import { APP_URL } from './appUrl.js';

// Values someone might genuinely paste in from `.env.example` without
// actually generating their own — each one is a real, exploitable session-
// forgery key if it ever reaches production unchanged.
const PLACEHOLDER_SESSION_SECRETS = new Set([
  'dev-secret-change-me',
  'replace-me-with-a-random-string',
]);
const MIN_SESSION_SECRET_LENGTH = 32;

// Pure validation — no env/process/console access of its own, so it's
// trivially unit-testable (see test/configCheck.test.js). `env` and
// `appUrl` default to the real values; tests pass fakes.
export function checkConfig(env = process.env, appUrl = APP_URL) {
  const isProd = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  if (isProd) {
    const secret = env.SESSION_SECRET;
    if (!secret || PLACEHOLDER_SESSION_SECRETS.has(secret) || secret.length < MIN_SESSION_SECRET_LENGTH) {
      errors.push(
        `SESSION_SECRET is missing, a known placeholder value, or shorter than ${MIN_SESSION_SECRET_LENGTH} characters. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    if (!appUrl.startsWith('https://')) {
      warnings.push(
        `APP_URL (${appUrl}) is not https — secure cookies will be rejected by browsers and login will ` +
        `silently fail. Set DOMAIN (or APP_URL) to your real HTTPS domain.`
      );
    }
  }

  // Whether or not this is production: if someone SET a master key, it must
  // actually be usable — a typo'd/truncated value currently gets silently
  // treated as "not configured" by secretCrypto.js, which would make every
  // secret-creation attempt fail with a confusing 500 that looks unrelated
  // to the env var actually being wrong.
  const rawKey = env.SECRET_MASTER_KEY;
  if (rawKey) {
    let byteLength = -1;
    try { byteLength = Buffer.from(rawKey, 'base64').length; } catch { byteLength = -1; }
    if (byteLength !== 32) {
      errors.push(
        'SECRET_MASTER_KEY is set but is not a valid 32-byte base64 value. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
    }
  }

  // An explicit CORS_ORIGIN always wins. Otherwise: in production, default
  // to this deployment's own URL rather than the permissive `true` (reflect
  // any origin) this app used to fall back to — the browser app is always
  // served same-origin from this same process, so it never actually needed
  // cross-origin CORS; the old default only ever widened the attack surface
  // for credentialed cross-origin requests. Non-production keeps the
  // permissive default so local dev (Vite on a different port) keeps working
  // with zero extra setup.
  const corsOrigin = env.CORS_ORIGIN || (isProd ? appUrl : true);

  return { errors, warnings, corsOrigin };
}

// Called once at boot. A fatal misconfiguration exits the process rather
// than starting a server that would run insecurely (a guessable session
// secret) or in a subtly broken way (secure cookies over http).
export function validateProductionConfig(env = process.env) {
  const { errors, warnings, corsOrigin } = checkConfig(env);

  for (const message of warnings) console.warn(`[config] WARNING: ${message}`);
  if (errors.length) {
    for (const message of errors) console.error(`[config] FATAL: ${message}`);
    process.exit(1);
  }

  // Safe boot diagnostics — presence/absence only, never a raw secret value.
  console.log(
    `[config] NODE_ENV=${env.NODE_ENV || 'development'} APP_URL=${APP_URL} CORS_ORIGIN=${corsOrigin} ` +
    `secrets=${env.SECRET_MASTER_KEY ? 'configured' : 'not configured'} ` +
    `email=${env.RESEND_API_KEY ? 'configured' : 'not configured (invite links logged instead)'}`
  );

  return { corsOrigin };
}
