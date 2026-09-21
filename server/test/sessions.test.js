import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp, bootstrapOrg } from './helpers/testApp.js';

setupTestEnv();
let app;
let createAuthToken;
beforeAll(async () => {
  app = await loadApp();
  ({ createAuthToken } = await import('../src/lib/authTokens.js'));
});

describe('sessions', () => {
  it('login creates a session that shows up in the listing, flagged as current', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessList' });
    const res = await org.agent.get('/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].current).toBe(true);
  });

  it('logging in from a second agent adds a second, independent session', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessTwo' });
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ email: org.user.email, password: 'password123' });

    const listFromFirst = await org.agent.get('/api/auth/sessions');
    expect(listFromFirst.body).toHaveLength(2);

    const me = await secondAgent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('revoking another of your own sessions signs that device out, but not this one', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessRevoke' });
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ email: org.user.email, password: 'password123' });

    const sessions = (await org.agent.get('/api/auth/sessions')).body;
    const other = sessions.find((s) => !s.current);

    const del = await org.agent.delete(`/api/auth/sessions/${other.id}`);
    expect(del.status).toBe(200);

    expect((await secondAgent.get('/api/auth/me')).status).toBe(401);
    expect((await org.agent.get('/api/auth/me')).status).toBe(200);
  });

  it('revoking your own current session signs this device out too', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessSelf' });
    const sessions = (await org.agent.get('/api/auth/sessions')).body;
    const current = sessions.find((s) => s.current);

    const del = await org.agent.delete(`/api/auth/sessions/${current.id}`);
    expect(del.status).toBe(200);
    expect((await org.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('cannot revoke another user\'s session', async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'sessCrossA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'sessCrossB' });
    const sessionsB = (await orgB.agent.get('/api/auth/sessions')).body;

    const res = await orgA.agent.delete(`/api/auth/sessions/${sessionsB[0].id}`);
    expect(res.status).toBe(404);
    expect((await orgB.agent.get('/api/auth/me')).status).toBe(200);
  });

  it('"sign out everywhere else" revokes other sessions but leaves the caller\'s own', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessOthers' });
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ email: org.user.email, password: 'password123' });

    const res = await org.agent.post('/api/auth/sessions/revoke-others');
    expect(res.status).toBe(200);

    expect((await secondAgent.get('/api/auth/me')).status).toBe(401);
    expect((await org.agent.get('/api/auth/me')).status).toBe(200);
  });

  it('logging out revokes the session, not just the cookie', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessLogout' });
    await org.agent.post('/api/auth/logout');
    expect((await org.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('a password reset revokes every session for that user', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'sessResetPw' });
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    expect((await secondAgent.get('/api/auth/me')).status).toBe(200);

    // /password-reset/request never echoes the token back (see
    // routes/auth.js — deliberately anti-enumeration), so mint one directly
    // via the same lib a real click-through resolves, the way sessions.js's
    // own tests exercise session creation directly rather than through HTTP.
    const resetToken = createAuthToken(org.user.id, 'password_reset', 60 * 60 * 1000);
    const resetRes = await request(app).post(`/api/auth/password-reset/${resetToken}`).send({ newPassword: 'brand-new-password' });
    expect(resetRes.status).toBe(200);

    expect((await org.agent.get('/api/auth/me')).status).toBe(401);
    expect((await secondAgent.get('/api/auth/me')).status).toBe(401);

    const loginOld = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    expect(loginOld.status).toBe(401);
    const loginNew = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'brand-new-password' });
    expect(loginNew.status).toBe(200);
  });
});
