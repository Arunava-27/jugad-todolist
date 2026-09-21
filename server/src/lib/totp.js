import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// Hand-rolled RFC 4226 (HOTP) / RFC 6238 (TOTP) — HMAC-SHA1, 30s step, 6
// digits, the same parameters every authenticator app (Google Authenticator,
// Authy, 1Password, ...) assumes by default when no algorithm/digits/period
// is specified in the otpauth:// URI. Node's built-in crypto covers the only
// primitive this needs (HMAC); pulling in a library for ~40 lines of well-
// specified math isn't worth a new dependency, same reasoning lib/email.js
// gives for skipping the Resend SDK. The one piece genuinely not worth
// hand-rolling is QR rendering — see routes/auth.js's use of the `qrcode`
// package for that.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    out += BASE32_ALPHABET[parseInt(bits.slice(bits.length - remainder).padEnd(5, '0'), 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, the RFC 4226 recommendation
}

export function totpUri(secret, email) {
  const label = encodeURIComponent(`Punchlist:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Punchlist&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0');
}

// The counterpart to verifyTotpCode — computes the code for right now. Not
// used by any route (a real device does this); exists so tests can drive a
// real enable/login flow against a real secret without an actual
// authenticator app. See test/totp.test.js.
export function currentTotpCode(secret) {
  return hotp(secret, Math.floor(Date.now() / 1000 / STEP_SECONDS));
}

// Accepts a code from the current 30s step or either adjacent one (±30s) to
// absorb normal clock drift between this server and the user's phone —
// without this window, a code generated right at a step boundary would
// legitimately fail more often than users would tolerate.
export function verifyTotpCode(secret, code) {
  const clean = String(code || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const delta of [0, -1, 1]) {
    if (hotp(secret, counter + delta) === clean) return true;
  }
  return false;
}

// Returned once at 2FA-enable time: `codes` (shown to the user, never
// stored) and `hashes` (what actually gets persisted, same bcrypt-hashed,
// shown-once shape as a personal access token — see lib/personalAccessTokens.js).
export function generateRecoveryCodes(count = 8) {
  const codes = Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
  const hashes = codes.map((code) => ({ hash: bcrypt.hashSync(code, 10), used_at: null }));
  return { codes, hashes };
}

// Checks a submitted recovery code against the user's stored (bcrypt-hashed)
// set and, if it matches an unused one, marks it used in place. Returns the
// updated hashes array to persist, or null if no unused code matched.
export function consumeRecoveryCode(storedHashes, code) {
  const clean = String(code || '').trim().toLowerCase();
  if (!clean) return null;
  const idx = storedHashes.findIndex((entry) => !entry.used_at && bcrypt.compareSync(clean, entry.hash));
  if (idx === -1) return null;
  const updated = storedHashes.map((entry, i) => (i === idx ? { ...entry, used_at: new Date().toISOString() } : entry));
  return updated;
}
