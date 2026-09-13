import crypto from 'node:crypto';

// AES-256-GCM for project secrets (Phase 10) — the only other crypto usage
// in this repo is bcrypt for password/token hashing, which is one-way and
// deliberately unrecoverable; this is the first place Punchlist needs to
// encrypt something it must later decrypt back to the original value.
//
// SECRET_MASTER_KEY is a 32-byte key, base64-encoded, provisioned the same
// tier as SESSION_SECRET/RESEND_API_KEY in docker-compose.yml. Reading it
// once at module load (not per-call) means a bad/missing key fails the same
// way for the life of the process rather than flapping.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM
const AUTH_TAG_LENGTH = 16;

const KEY = (() => {
  const raw = process.env.SECRET_MASTER_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
})();

// Deliberately does NOT throw at import time — an install with zero secrets
// created yet (every install, until someone uses this feature) must still
// boot cleanly even if SECRET_MASTER_KEY was never set. Only the moment
// something actually tries to encrypt/decrypt does the missing key become a
// real, loud error — see the two functions below.
export function secretEncryptionConfigured() {
  return !!KEY;
}

function requireKey() {
  if (!KEY) {
    throw new Error('SECRET_MASTER_KEY is not configured on this server — an admin needs to set it before secrets can be created or read.');
  }
  return KEY;
}

// Binary-safe primitives — used directly for file secrets (the raw upload
// buffer, whatever bytes it contains) and wrapped by the string helpers
// below for key-value secrets. Wire format: iv || authTag || ciphertext,
// all concatenated into one buffer.
export function encryptBuffer(plaintextBuf) {
  const key = requireKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(encryptedBuf) {
  const key = requireKey();
  const iv = encryptedBuf.subarray(0, IV_LENGTH);
  const authTag = encryptedBuf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// String convenience wrappers for kv secret values, stored as a base64 TEXT
// column (project_secrets.value_encrypted).
export function encryptSecretValue(plaintext) {
  return encryptBuffer(Buffer.from(String(plaintext), 'utf8')).toString('base64');
}

export function decryptSecretValue(encoded) {
  return decryptBuffer(Buffer.from(encoded, 'base64')).toString('utf8');
}
