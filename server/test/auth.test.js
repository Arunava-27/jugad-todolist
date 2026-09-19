import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp } from './helpers/testApp.js';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

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
