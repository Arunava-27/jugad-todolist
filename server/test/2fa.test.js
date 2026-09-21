import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp, bootstrapOrg } from './helpers/testApp.js';
import { currentTotpCode } from '../src/lib/totp.js';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

// Drives setup -> confirm with a real, freshly-computed code -> the two
// recovery codes returned once -> login now requiring 2FA, end to end. The
// point of currentTotpCode (see lib/totp.js) is exactly this — a real code
// for a real secret, without an actual authenticator app.
async function enableTwoFactor(agent) {
  const setup = await agent.post('/api/auth/2fa/setup');
  expect(setup.status).toBe(200);
  const code = currentTotpCode(setup.body.secret);
  const enable = await agent.post('/api/auth/2fa/enable').send({ code });
  expect(enable.status).toBe(200);
  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
}

describe('two-factor setup', () => {
  it('enabling requires a valid code', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaBadCode' });
    const setup = await org.agent.post('/api/auth/2fa/setup');
    expect(setup.status).toBe(200);

    const badEnable = await org.agent.post('/api/auth/2fa/enable').send({ code: '000000' });
    expect(badEnable.status).toBe(400);

    const me = await org.agent.get('/api/auth/me');
    expect(me.body.user.twoFactorEnabled).toBe(false);
  });

  it('a correct code enables it and returns recovery codes once', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaEnable' });
    const { recoveryCodes } = await enableTwoFactor(org.agent);
    expect(recoveryCodes).toHaveLength(8);

    const me = await org.agent.get('/api/auth/me');
    expect(me.body.user.twoFactorEnabled).toBe(true);
  });

  it('cannot enable twice', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaTwice' });
    await enableTwoFactor(org.agent);
    const setupAgain = await org.agent.post('/api/auth/2fa/setup');
    expect(setupAgain.status).toBe(409);
  });
});

describe('two-factor login', () => {
  it('login with 2FA enabled returns a pending challenge instead of a session', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaLogin' });
    const { secret } = await enableTwoFactor(org.agent);

    const login = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequired).toBe(true);
    expect(login.body.pendingToken).toBeTruthy();

    const freshAgent = request.agent(app);
    // The login above used a bare `request(app)`, not an agent, so no cookie
    // was ever set — confirms the pending-2FA response never establishes a session.
    expect((await freshAgent.get('/api/auth/me')).status).toBe(401);

    const code = currentTotpCode(secret);
    const finish = await freshAgent.post('/api/auth/2fa/login').send({ pendingToken: login.body.pendingToken, code });
    expect(finish.status).toBe(200);
    expect((await freshAgent.get('/api/auth/me')).status).toBe(200);
  });

  it('a wrong code is rejected and does not complete the login', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaWrong' });
    await enableTwoFactor(org.agent);

    const login = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    const freshAgent = request.agent(app);
    const finish = await freshAgent.post('/api/auth/2fa/login').send({ pendingToken: login.body.pendingToken, code: '000000' });
    expect(finish.status).toBe(401);
    expect((await freshAgent.get('/api/auth/me')).status).toBe(401);
  });

  it('a recovery code completes login exactly once', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaRecovery' });
    const { recoveryCodes } = await enableTwoFactor(org.agent);
    const oneCode = recoveryCodes[0];

    const login1 = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    const agent1 = request.agent(app);
    const finish1 = await agent1.post('/api/auth/2fa/login').send({ pendingToken: login1.body.pendingToken, code: oneCode });
    expect(finish1.status).toBe(200);

    const login2 = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    const agent2 = request.agent(app);
    const finish2 = await agent2.post('/api/auth/2fa/login').send({ pendingToken: login2.body.pendingToken, code: oneCode });
    expect(finish2.status).toBe(401);
  });
});

describe('two-factor disable', () => {
  it('requires the correct password', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaDisableBad' });
    await enableTwoFactor(org.agent);

    const res = await org.agent.post('/api/auth/2fa/disable').send({ password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect((await org.agent.get('/api/auth/me')).body.user.twoFactorEnabled).toBe(true);
  });

  it('disables with the correct password, and login no longer requires a code', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'twofaDisableOk' });
    await enableTwoFactor(org.agent);

    const res = await org.agent.post('/api/auth/2fa/disable').send({ password: 'password123' });
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: org.user.email, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequired).toBeUndefined();
  });
});
