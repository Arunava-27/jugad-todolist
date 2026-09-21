import { describe, it, expect } from 'vitest';
import { generateTotpSecret, totpUri, verifyTotpCode, currentTotpCode, generateRecoveryCodes, consumeRecoveryCode } from '../src/lib/totp.js';

describe('totp', () => {
  it('a code generated for a secret verifies against that same secret', () => {
    const secret = generateTotpSecret();
    const code = currentTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('a code generated for a different secret does not verify', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const code = currentTotpCode(secretA);
    expect(verifyTotpCode(secretB, code)).toBe(false);
  });

  it('rejects garbage input without throwing', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, 'not-a-code')).toBe(false);
    expect(verifyTotpCode(secret, undefined)).toBe(false);
    expect(verifyTotpCode(secret, '12345')).toBe(false); // too short
  });

  it('builds a standard otpauth:// URI', () => {
    const secret = generateTotpSecret();
    const uri = totpUri(secret, 'person@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=Punchlist');
  });
});

describe('recovery codes', () => {
  it('generates codes whose hashes verify, each usable exactly once', () => {
    const { codes, hashes } = generateRecoveryCodes(3);
    expect(codes).toHaveLength(3);
    expect(hashes).toHaveLength(3);

    const afterFirstUse = consumeRecoveryCode(hashes, codes[0]);
    expect(afterFirstUse).not.toBeNull();
    expect(afterFirstUse.find((h) => h.hash === hashes[0].hash).used_at).toBeTruthy();

    // Reusing the same (now-consumed) code against the updated set fails.
    expect(consumeRecoveryCode(afterFirstUse, codes[0])).toBeNull();
    // A different, still-unused code still works against the updated set.
    expect(consumeRecoveryCode(afterFirstUse, codes[1])).not.toBeNull();
  });

  it('rejects an unknown code', () => {
    const { hashes } = generateRecoveryCodes(2);
    expect(consumeRecoveryCode(hashes, 'not-a-real-code')).toBeNull();
  });
});
