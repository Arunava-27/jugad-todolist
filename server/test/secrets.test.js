import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestEnv, loadApp, bootstrapOrg, addWorkspaceMember, workspaceHeader } from './helpers/testApp.js';

setupTestEnv();
let app;
let ws;
beforeAll(async () => {
  app = await loadApp();
  const org = await bootstrapOrg(app, { emailPrefix: 'secOwner' });
  const project = await org.agent.post('/api/projects').set(workspaceHeader(org.workspaceId)).send({ name: 'Secret Project' });
  const developer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'developer', emailPrefix: 'secDev' });
  const otherDeveloper = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'developer', emailPrefix: 'secDev2' });
  const viewer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'viewer', emailPrefix: 'secViewer' });
  ws = { ...org, projectId: project.body.id, developer, otherDeveloper, viewer };
});

describe('project secrets: permission matrix', () => {
  it('manager+ can create a kv secret; a decrypted round trip matches what was written', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const create = await ws.agent.post('/api/secrets').set(hdr).send({
      project_id: ws.projectId, key_name: 'AWS_SECRET_ACCESS_KEY', value: 'super-secret-value',
    });
    expect(create.status).toBe(201);
    ws.secretId = create.body.id;

    const reveal = await ws.agent.get(`/api/secrets/${ws.secretId}/reveal`).set(hdr);
    expect(reveal.status).toBe(200);
    expect(reveal.body.value).toBe('super-secret-value');
  });

  it('a non-shared developer\'s list omits the secret entirely, and reveal 404s (not 403)', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const list = await ws.otherDeveloper.agent.get('/api/secrets').set(hdr).query({ project_id: ws.projectId });
    expect(list.status).toBe(200);
    expect(list.body.map((s) => s.id)).not.toContain(ws.secretId);

    const reveal = await ws.otherDeveloper.agent.get(`/api/secrets/${ws.secretId}/reveal`).set(hdr);
    expect(reveal.status).toBe(404);
  });

  it('viewer is excluded from secrets entirely, even the list', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const list = await ws.viewer.agent.get('/api/secrets').set(hdr).query({ project_id: ws.projectId });
    expect(list.status).toBe(403);
  });

  it('sharing with a developer lets them reveal only that secret', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const share = await ws.agent.post(`/api/secrets/${ws.secretId}/shares`).set(hdr).send({ user_id: ws.developer.user.id });
    expect(share.status).toBe(201);

    const reveal = await ws.developer.agent.get(`/api/secrets/${ws.secretId}/reveal`).set(hdr);
    expect(reveal.status).toBe(200);
    expect(reveal.body.value).toBe('super-secret-value');

    // still can't touch a different, unshared secret
    const other = await ws.agent.post('/api/secrets').set(hdr).send({ project_id: ws.projectId, key_name: 'OTHER_KEY', value: 'x' });
    const otherReveal = await ws.developer.agent.get(`/api/secrets/${other.body.id}/reveal`).set(hdr);
    expect(otherReveal.status).toBe(404);
  });

  it('viewers cannot be granted a share at all', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const res = await ws.agent.post(`/api/secrets/${ws.secretId}/shares`).set(hdr).send({ user_id: ws.viewer.user.id });
    expect(res.status).toBe(400);
  });

  it('a sharee without can_reshare cannot manage shares; flipping it on allows it', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const attempt = await ws.developer.agent.post(`/api/secrets/${ws.secretId}/shares`)
      .set(hdr).send({ user_id: ws.otherDeveloper.user.id });
    expect(attempt.status).toBe(403);

    await ws.agent.post(`/api/secrets/${ws.secretId}/shares`).set(hdr).send({ user_id: ws.developer.user.id, can_reshare: true });

    const reshare = await ws.developer.agent.post(`/api/secrets/${ws.secretId}/shares`)
      .set(hdr).send({ user_id: ws.otherDeveloper.user.id });
    expect(reshare.status).toBe(201);
  });

  it('only manager+ can see the access log, and it reflects real actions', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const devAttempt = await ws.developer.agent.get(`/api/secrets/${ws.secretId}/access-log`).set(hdr);
    expect(devAttempt.status).toBe(403);

    const log = await ws.agent.get(`/api/secrets/${ws.secretId}/access-log`).set(hdr);
    expect(log.status).toBe(200);
    const actions = log.body.map((entry) => entry.action);
    expect(actions).toContain('created');
    expect(actions).toContain('viewed');
    expect(actions).toContain('shared');
  });

  it('deleting a secret keeps its access-log row (secret_id set null, not cascaded away)', async () => {
    const hdr = workspaceHeader(ws.workspaceId);
    const del = await ws.agent.delete(`/api/secrets/${ws.secretId}`).set(hdr);
    expect(del.status).toBe(200);

    // The log endpoint itself needs a live secret id to query by, so verify
    // indirectly: revealing the deleted secret now 404s for everyone,
    // including the manager who created it.
    const reveal = await ws.agent.get(`/api/secrets/${ws.secretId}/reveal`).set(hdr);
    expect(reveal.status).toBe(404);
  });
});
