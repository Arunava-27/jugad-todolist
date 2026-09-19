import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestEnv, loadApp, bootstrapOrg, workspaceHeader } from './helpers/testApp.js';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

describe('organization tenancy isolation', () => {
  it('org A owner gets 403 reaching org B workspace even via X-Workspace-Id', async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'tenA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'tenB' });

    const res = await orgA.agent.get('/api/projects').set(workspaceHeader(orgB.workspaceId));
    expect(res.status).toBe(403);
  });

  it("org A owner's workspace list never includes org B's workspace", async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'listA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'listB' });

    const res = await orgA.agent.get('/api/workspaces');
    expect(res.status).toBe(200);
    expect(res.body.map((w) => w.id)).not.toContain(orgB.workspaceId);
  });

  it('inviting an email that already belongs to a different organization is rejected', async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'crossA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'crossB' });

    const res = await orgA.agent.post(`/api/workspaces/${orgA.workspaceId}/members`).send({
      email: orgB.user.email, role: 'developer',
    });
    expect(res.status).toBe(409);
  });

  it('an admin route is scoped to the caller\'s own organization', async () => {
    const orgA = await bootstrapOrg(app, { emailPrefix: 'adminA' });
    const orgB = await bootstrapOrg(app, { emailPrefix: 'adminB' });

    const usersA = await orgA.agent.get('/api/admin/users');
    expect(usersA.status).toBe(200);
    const emailsA = usersA.body.map((u) => u.email);
    expect(emailsA).not.toContain(orgB.user.email);
  });

  it('only the org owner may create a workspace', async () => {
    const org = await bootstrapOrg(app, { emailPrefix: 'wsOwner' });
    const { addWorkspaceMember } = await import('./helpers/testApp.js');
    const developer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'developer', emailPrefix: 'wsOwnerDev' });

    const res = await developer.agent.post('/api/workspaces').send({ name: 'Should not be allowed' });
    expect(res.status).toBe(403);
  });
});
