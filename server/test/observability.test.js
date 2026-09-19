import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp } from './helpers/testApp.js';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

describe('request logging', () => {
  it('every response carries a unique X-Request-Id header', async () => {
    const a = await request(app).get('/api/health');
    const b = await request(app).get('/api/health');
    expect(a.headers['x-request-id']).toBeTruthy();
    expect(b.headers['x-request-id']).toBeTruthy();
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('liveness and readiness', () => {
  it('/api/health always answers ok with no dependency checks', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('/api/ready succeeds when the database is reachable (the normal case)', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('client error reporting', () => {
  it('accepts a well-formed report with no auth required', async () => {
    const res = await request(app).post('/api/client-errors').send({
      message: 'TypeError: x is not a function', stack: 'at foo.js:1:1', url: 'https://example.com/app',
    });
    expect(res.status).toBe(204);
  });

  it('accepts a malformed/empty body without erroring', async () => {
    const res = await request(app).post('/api/client-errors').send({});
    expect(res.status).toBe(204);
  });

  it('is rate-limited per IP', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 35 }, () => request(app).post('/api/client-errors').send({ message: 'spam' }))
    );
    expect(attempts.some((r) => r.status === 429)).toBe(true);
  });
});
