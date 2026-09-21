import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp } from './helpers/testApp.js';

setupTestEnv();
let app;
let createAuthToken;
beforeAll(async () => {
  app = await loadApp();
  ({ createAuthToken } = await import('../src/lib/authTokens.js'));
});

describe('registration', () => {
  it('founding a new org (no invite) makes the first user its owner', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'founder@example.com', name: 'Founder', password: 'password123', organizationName: 'Acme',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('owner');
    expect(res.body.workspaces).toEqual([]);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'short@example.com', name: 'Short', password: 'abc123', organizationName: 'Acme2',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email', name: 'Bad', password: 'password123', organizationName: 'Acme3',
    });
    expect(res.status).toBe(400);
  });

  it('rejects registering without an org name and no invite token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'noorg@example.com', name: 'No Org', password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dupe@example.com', name: 'First', password: 'password123', organizationName: 'DupeOrg',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dupe@example.com', name: 'Second', password: 'password123', organizationName: 'DupeOrg2',
    });
    expect(res.status).toBe(409);
  });
});

describe('login and session', () => {
  it('logs in with correct credentials and persists the session across requests', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'session@example.com', name: 'Sess', password: 'password123', organizationName: 'SessOrg',
    });
    const login = await agent.post('/api/auth/login').send({ email: 'session@example.com', password: 'password123' });
    expect(login.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('session@example.com');
  });

  it('rejects a wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'wrongpw@example.com', name: 'W', password: 'password123', organizationName: 'WrongPwOrg',
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'wrongpw@example.com', password: 'nope-nope-nope' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('/me is 401 with no session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout clears the session so /me becomes 401 again', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'logout@example.com', name: 'L', password: 'password123', organizationName: 'LogoutOrg',
    });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('protected routes with no auth', () => {
  it('a workspace-scoped route 401s with no session and no bearer token', async () => {
    const res = await request(app).get('/api/projects').set('X-Workspace-Id', '1');
    expect(res.status).toBe(401);
  });
});

describe('email verification', () => {
  it('a fresh registration is unverified until the link is followed', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'unverified@example.com', name: 'U', password: 'password123', organizationName: 'VerifyOrg',
    });
    expect(register.body.user.emailVerified).toBe(false);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.emailVerified).toBe(false);
  });

  it('a valid token verifies the account, and cannot be reused', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'verifyme@example.com', name: 'V', password: 'password123', organizationName: 'VerifyOrg2',
    });
    const token = createAuthToken(register.body.user.id, 'verify_email', 24 * 60 * 60 * 1000);

    const first = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(first.status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.emailVerified).toBe(true);

    const second = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(second.status).toBe(410);
  });

  it('an expired token is rejected', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'expiredverify@example.com', name: 'E', password: 'password123', organizationName: 'VerifyOrg3',
    });
    const token = createAuthToken(register.body.user.id, 'verify_email', -1000); // already expired

    const res = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(res.status).toBe(410);
  });

  it('resend is a no-op once already verified', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'resend@example.com', name: 'R', password: 'password123', organizationName: 'VerifyOrg4',
    });
    const token = createAuthToken(register.body.user.id, 'verify_email', 24 * 60 * 60 * 1000);
    await request(app).get(`/api/auth/verify-email/${token}`);

    const resend = await agent.post('/api/auth/verify-email/resend');
    expect(resend.status).toBe(200);
    expect(resend.body.alreadyVerified).toBe(true);
  });
});

describe('password reset', () => {
  it('/password-reset/request responds 200 the same way for an unknown email', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'nobody-here@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('a valid reset token changes the password and cannot be reused', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'resetme@example.com', name: 'R', password: 'password123', organizationName: 'ResetOrg',
    });
    const token = createAuthToken(register.body.user.id, 'password_reset', 60 * 60 * 1000);

    const reset = await request(app).post(`/api/auth/password-reset/${token}`).send({ newPassword: 'a-new-password' });
    expect(reset.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({ email: 'resetme@example.com', password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'resetme@example.com', password: 'a-new-password' })).status).toBe(200);

    const reuse = await request(app).post(`/api/auth/password-reset/${token}`).send({ newPassword: 'yet-another-password' });
    expect(reuse.status).toBe(410);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/auth/register').send({
      email: 'resetshort@example.com', name: 'R', password: 'password123', organizationName: 'ResetOrg2',
    });
    const token = createAuthToken(register.body.user.id, 'password_reset', 60 * 60 * 1000);

    const res = await request(app).post(`/api/auth/password-reset/${token}`).send({ newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown/expired token', async () => {
    const res = await request(app).post('/api/auth/password-reset/not-a-real-token').send({ newPassword: 'a-new-password' });
    expect(res.status).toBe(410);
  });
});
