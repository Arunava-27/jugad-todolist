import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestEnv, loadApp, bootstrapOrg, addWorkspaceMember, workspaceHeader } from './helpers/testApp.js';

setupTestEnv();
let app;
beforeAll(async () => { app = await loadApp(); });

// One shared workspace with all five roles represented, reused read-only
// across every test below — this file only ever creates data, never mutates
// shared fixtures, so tests can run in any order.
async function buildWorkspace(prefix) {
  const org = await bootstrapOrg(app, { emailPrefix: `${prefix}Owner` });
  const admin = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'admin', emailPrefix: `${prefix}Admin` });
  const manager = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'manager', emailPrefix: `${prefix}Manager` });
  const developer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'developer', emailPrefix: `${prefix}Dev` });
  const viewer = await addWorkspaceMember(app, org.agent, org.workspaceId, { role: 'viewer', emailPrefix: `${prefix}Viewer` });
  return { ...org, admin, manager, developer, viewer };
}

describe('viewer role: read-only across the whole workspace', () => {
  it('GET is allowed, but any non-GET is blocked, on a workspace-scoped route', async () => {
    const ws = await buildWorkspace('viewerRo');
    const hdr = workspaceHeader(ws.workspaceId);

    expect((await ws.viewer.agent.get('/api/projects').set(hdr)).status).toBe(200);
    expect((await ws.viewer.agent.post('/api/projects').set(hdr).send({ name: 'Nope' })).status).toBe(403);
    expect((await ws.viewer.agent.post('/api/sections').set(hdr).send({ name: 'Nope', project_id: 1 })).status).toBe(403);
  });
});

describe('project/section CRUD: manager+ only', () => {
  it('developer is blocked from creating a project; manager can', async () => {
    const ws = await buildWorkspace('projGate');
    const hdr = workspaceHeader(ws.workspaceId);

    const devAttempt = await ws.developer.agent.post('/api/projects').set(hdr).send({ name: 'Dev Project' });
    expect(devAttempt.status).toBe(403);

    const mgrAttempt = await ws.manager.agent.post('/api/projects').set(hdr).send({ name: 'Mgr Project' });
    expect(mgrAttempt.status).toBe(201);
  });

  it('developer is blocked from deleting a task; manager can', async () => {
    const ws = await buildWorkspace('taskDelGate');
    const hdr = workspaceHeader(ws.workspaceId);

    const task = await ws.manager.agent.post('/api/tasks').set(hdr).send({ title: 'Delete me' });
    expect(task.status).toBe(201);
    const taskId = task.body.id;

    const devDelete = await ws.developer.agent.delete(`/api/tasks/${taskId}`).set(hdr);
    expect(devDelete.status).toBe(403);

    const mgrDelete = await ws.manager.agent.delete(`/api/tasks/${taskId}`).set(hdr);
    expect(mgrDelete.status).toBe(200);
  });
});

describe('task assignment: self-assign is open, assigning others needs manager+', () => {
  it('a developer can self-assign a task', async () => {
    const ws = await buildWorkspace('selfAssign');
    const hdr = workspaceHeader(ws.workspaceId);

    const res = await ws.developer.agent.post('/api/tasks').set(hdr).send({
      title: 'Self assign', member_ids: [ws.developer.user.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.members.map((m) => m.id)).toEqual([ws.developer.user.id]);
  });

  it('a developer cannot assign a task to someone else', async () => {
    const ws = await buildWorkspace('otherAssign');
    const hdr = workspaceHeader(ws.workspaceId);

    const res = await ws.developer.agent.post('/api/tasks').set(hdr).send({
      title: 'Assign someone else', member_ids: [ws.admin.user.id],
    });
    expect(res.status).toBe(403);
  });

  it('a manager can assign a task to someone else', async () => {
    const ws = await buildWorkspace('mgrAssign');
    const hdr = workspaceHeader(ws.workspaceId);

    const res = await ws.manager.agent.post('/api/tasks').set(hdr).send({
      title: 'Manager assigns', member_ids: [ws.developer.user.id],
    });
    expect(res.status).toBe(201);
  });
});

describe('workspace membership management: admin+ only', () => {
  it('a manager cannot invite/add a new workspace member', async () => {
    const ws = await buildWorkspace('inviteGate');
    const res = await ws.manager.agent.post(`/api/workspaces/${ws.workspaceId}/members`).send({
      email: 'someone-new@example.com', role: 'developer',
    });
    expect(res.status).toBe(403);
  });

  it('an admin can invite a new workspace member', async () => {
    const ws = await buildWorkspace('inviteOk');
    const res = await ws.admin.agent.post(`/api/workspaces/${ws.workspaceId}/members`).send({
      email: 'someone-new2@example.com', role: 'developer',
    });
    expect(res.status).toBe(201);
  });
});

describe('requireWorkspace header handling', () => {
  it('missing X-Workspace-Id is a 400, not a 500 or silent pass-through', async () => {
    const ws = await buildWorkspace('missingHeader');
    const res = await ws.developer.agent.get('/api/projects');
    expect(res.status).toBe(400);
  });

  it('a non-member cannot reach a workspace they have no role in', async () => {
    const wsA = await buildWorkspace('nonMemberA');
    const wsB = await buildWorkspace('nonMemberB');
    const res = await wsA.developer.agent.get('/api/projects').set(workspaceHeader(wsB.workspaceId));
    expect(res.status).toBe(403);
  });
});
