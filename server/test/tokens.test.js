import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestEnv, loadApp, bootstrapOrg, addWorkspaceMember, workspaceHeader } from './helpers/testApp.js';
import request from 'supertest';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

describe('personal access tokens', () => {
  it('a self-created token authenticates identically to the cookie session', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'patOwner' });
    const createRes = await org.agent.post('/api/tokens').send({ name: 'Test token' });
    expect(createRes.status).toBe(201);
    const raw = createRes.body.token;
    expect(raw).toMatch(/^pat_/);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${raw}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(org.user.email);
  });

  it('an unknown/garbage bearer token is 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer pat_totallynotreal');
    expect(res.status).toBe(401);
  });

  it('revoking a token makes it stop working immediately', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'patRevoke' });
    const createRes = await org.agent.post('/api/tokens').send({ name: 'Revoke me' });
    const raw = createRes.body.token;
    const id = createRes.body.id;

    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${raw}`)).status).toBe(200);

    const del = await org.agent.delete(`/api/tokens/${id}`);
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${raw}`);
    expect(after.status).toBe(401);
  });

  it('a PAT respects the same role boundaries a cookie session would', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'patRole' });
    const developer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'developer', emailPrefix: 'patRoleDev' });

    const createRes = await developer.agent.post('/api/tokens').send({ name: 'Dev token' });
    const raw = createRes.body.token;

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${raw}`)
      .set(workspaceHeader(org.workspaceId))
      .send({ name: 'Should be blocked' });
    expect(res.status).toBe(403);
  });

  it('a token only ever lists/deletes its own owner\'s tokens', async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'patOwnA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'patOwnB' });
    const tokenB = await orgB.agent.post('/api/tokens').send({ name: 'B token' });

    const del = await orgA.agent.delete(`/api/tokens/${tokenB.body.id}`);
    expect(del.status).toBe(404);
  });
});
