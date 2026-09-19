import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';

// Each test FILE runs in its own forked process (see vitest.config.js), so
// pointing DATA_DIR at a fresh temp directory before the first
// `import('../../src/app.js')` gives that whole file a private, empty
// SQLite database — no fixture cleanup needed between files, and tests in
// different files never interfere with each other.
export function setupTestEnv({ withSecretKey = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'punchlist-test-'));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-not-for-prod';
  if (withSecretKey) {
    process.env.SECRET_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  } else {
    delete process.env.SECRET_MASTER_KEY;
  }
}

export async function loadApp() {
  const mod = await import('../../src/app.js');
  return mod.default;
}

let orgCounter = 0;

// Registers a brand-new organization — the first person in it becomes its
// 'owner' — and a workspace inside it. Returns a cookie-carrying supertest
// agent for the owner, the owner's public user record, and the new
// workspace's id.
export async function bootstrapOrg(app, { emailPrefix = 'owner' } = {}) {
  orgCounter += 1;
  const email = `${emailPrefix}${orgCounter}@example.com`;
  const agent = request.agent(app);
  const registerRes = await agent.post('/api/auth/register').send({
    email,
    name: 'Org Owner',
    password: 'password123',
    organizationName: `Test Org ${orgCounter}`,
  });
  if (registerRes.status !== 201) {
    throw new Error(`bootstrapOrg register failed: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
  }
  const wsRes = await agent.post('/api/workspaces').send({ name: 'Main Workspace' });
  if (wsRes.status !== 201) {
    throw new Error(`bootstrapOrg workspace create failed: ${wsRes.status} ${JSON.stringify(wsRes.body)}`);
  }
  return { agent, user: registerRes.body.user, workspaceId: wsRes.body.id };
}

// Adds a brand-new person to an existing workspace at a given role, going
// through the real invite flow (POST .../members -> issues an invite since
// RESEND_API_KEY is unset in tests -> register-with-token -> accept),
// exactly the path a real invited teammate follows. Returns a fresh
// cookie-carrying agent for that person plus their public user record.
export async function addWorkspaceMember(app, ownerAgent, workspaceId, { role, emailPrefix = 'member' } = {}) {
  orgCounter += 1;
  const email = `${emailPrefix}${orgCounter}@example.com`;
  const inviteRes = await ownerAgent.post(`/api/workspaces/${workspaceId}/members`).send({ email, role });
  if (inviteRes.status !== 201) {
    throw new Error(`addWorkspaceMember invite failed: ${inviteRes.status} ${JSON.stringify(inviteRes.body)}`);
  }
  const token = new URL(inviteRes.body.inviteLink).searchParams.get('invite');

  const agent = request.agent(app);
  const registerRes = await agent.post('/api/auth/register').send({
    email, name: `Member ${orgCounter}`, password: 'password123', inviteToken: token,
  });
  if (registerRes.status !== 201) {
    throw new Error(`addWorkspaceMember register failed: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
  }
  const acceptRes = await agent.post(`/api/invites/${token}/accept`);
  if (acceptRes.status !== 200) {
    throw new Error(`addWorkspaceMember accept failed: ${acceptRes.status} ${JSON.stringify(acceptRes.body)}`);
  }
  return { agent, user: registerRes.body.user };
}

export function workspaceHeader(id) {
  return { 'X-Workspace-Id': String(id) };
}
