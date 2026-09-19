import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, loadApp, bootstrapOrg, workspaceHeader } from './helpers/testApp.js';

// SECRET_MASTER_KEY must be UNSET for the whole life of this process, since
// secretCrypto.js reads it once at module-load time — this has to be its
// own file so it gets its own forked process (see vitest.config.js) rather
// than sharing one with any test that sets the key.
setupTestEnv({ withSecretKey: false });
let app;
beforeAll(async () => { app = await loadApp(); });

describe('boot safety without SECRET_MASTER_KEY configured', () => {
  it('the server boots cleanly with zero secrets and no key set', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('creating a secret with no master key fails loudly (500), not a crash', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'noKeyOwner' });
    const project = await org.agent.post('/api/projects').set(workspaceHeader(org.workspaceId)).send({ name: 'No Key Project' });

    const res = await org.agent.post('/api/secrets').set(workspaceHeader(org.workspaceId)).send({
      project_id: project.body.id, key_name: 'WHATEVER', value: 'x',
    });
    expect(res.status).toBe(500);

    // The process is still alive and serving other requests after that failure.
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
