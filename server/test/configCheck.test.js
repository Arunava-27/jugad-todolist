import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { checkConfig } from '../src/lib/configCheck.js';

const validKey = crypto.randomBytes(32).toString('base64');
const longSecret = crypto.randomBytes(32).toString('hex'); // 64 chars, well over the 32-char minimum

describe('checkConfig — SESSION_SECRET in production', () => {
  it('is fatal when unset', () => {
    const { errors } = checkConfig({ NODE_ENV: 'production' }, 'https://example.com');
    expect(errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
  });

  it('is fatal when it is the shipped dev placeholder', () => {
    const { errors } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: 'dev-secret-change-me' }, 'https://example.com');
    expect(errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
  });

  it('is fatal when it is the .env.example placeholder', () => {
    const { errors } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: 'replace-me-with-a-random-string' }, 'https://example.com');
    expect(errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
  });

  it('is fatal when shorter than 32 characters', () => {
    const { errors } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: 'too-short' }, 'https://example.com');
    expect(errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
  });

  it('passes with a real, long random secret', () => {
    const { errors } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: longSecret }, 'https://example.com');
    expect(errors).toEqual([]);
  });

  it('is not checked outside production, even when missing', () => {
    const { errors } = checkConfig({ NODE_ENV: 'development' }, 'http://localhost:5173');
    expect(errors).toEqual([]);
  });
});

describe('checkConfig — APP_URL scheme in production', () => {
  it('warns (does not fail) when APP_URL is not https in production', () => {
    const { errors, warnings } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: longSecret }, 'http://example.com');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('https'))).toBe(true);
  });

  it('is silent when APP_URL is https', () => {
    const { warnings } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: longSecret }, 'https://example.com');
    expect(warnings).toEqual([]);
  });
});

describe('checkConfig — SECRET_MASTER_KEY', () => {
  it('is fine when unset', () => {
    const { errors } = checkConfig({ NODE_ENV: 'development' }, 'http://localhost:5173');
    expect(errors).toEqual([]);
  });

  it('is fatal when set but not valid base64 for 32 bytes', () => {
    const { errors } = checkConfig({ NODE_ENV: 'development', SECRET_MASTER_KEY: 'not-a-real-key' }, 'http://localhost:5173');
    expect(errors.some((e) => e.includes('SECRET_MASTER_KEY'))).toBe(true);
  });

  it('is fatal for a key of the wrong byte length even if valid base64', () => {
    const shortKey = Buffer.from('too short').toString('base64');
    const { errors } = checkConfig({ NODE_ENV: 'development', SECRET_MASTER_KEY: shortKey }, 'http://localhost:5173');
    expect(errors.some((e) => e.includes('SECRET_MASTER_KEY'))).toBe(true);
  });

  it('passes for a real 32-byte base64 key, checked even outside production', () => {
    const { errors } = checkConfig({ NODE_ENV: 'development', SECRET_MASTER_KEY: validKey }, 'http://localhost:5173');
    expect(errors).toEqual([]);
  });
});

describe('checkConfig — CORS origin resolution', () => {
  it('defaults to permissive (true) outside production', () => {
    const { corsOrigin } = checkConfig({ NODE_ENV: 'development' }, 'http://localhost:5173');
    expect(corsOrigin).toBe(true);
  });

  it('defaults to the app\'s own URL in production when CORS_ORIGIN is unset', () => {
    const { corsOrigin } = checkConfig({ NODE_ENV: 'production', SESSION_SECRET: longSecret }, 'https://example.com');
    expect(corsOrigin).toBe('https://example.com');
  });

  it('an explicit CORS_ORIGIN always wins, in any environment', () => {
    const { corsOrigin } = checkConfig(
      { NODE_ENV: 'production', SESSION_SECRET: longSecret, CORS_ORIGIN: 'https://custom.example.com' },
      'https://example.com'
    );
    expect(corsOrigin).toBe('https://custom.example.com');
  });
});
