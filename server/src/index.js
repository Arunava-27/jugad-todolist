import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import workspaceRoutes from './routes/workspaces.js';
import inviteRoutes from './routes/invites.js';
import adminRoutes from './routes/admin.js';
import projectRoutes from './routes/projects.js';
import projectSummaryRoutes from './routes/projectSummary.js';
import taskRoutes from './routes/tasks.js';
import labelRoutes from './routes/labels.js';
import statusRoutes from './routes/statuses.js';
import priorityRoutes from './routes/priorities.js';
import sectionRoutes from './routes/sections.js';
import teamRoutes from './routes/teams.js';
import tokenRoutes from './routes/tokens.js';
import overviewRoutes from './routes/overview.js';
import attachmentRoutes from './routes/attachments.js';
import { requireAuth, requireAdmin, requireWorkspace } from './middleware/auth.js';
import { createMcpServer } from './mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { APP_URL } from './lib/appUrl.js';
import './db/index.js'; // ensure schema is applied on boot

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // behind Caddy in production

app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(cookieSession({
  name: 'jugad_session',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax',
  secure: isProd,
  httpOnly: true,
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// The OAuth authorization server (Phase 9) — deliberately mounted at the
// root, unauthenticated: these routes (discovery docs, Dynamic Client
// Registration, the authorize/token endpoints) are how a Claude client gets
// *to* an authenticated state, so none of them can sit behind requireAuth.
// See routes/oauth.js for the full design.
app.use('/', oauthRoutes);

app.use('/api/auth', authRoutes);
// Not behind requireAuth: GET /api/invites/:token must work for a visitor
// who isn't signed in yet; the POST .../accept route requires auth itself.
app.use('/api/invites', inviteRoutes);
app.use('/api/workspaces', requireAuth, workspaceRoutes);
// Account-scoped, not workspace-scoped — a personal access token belongs to
// a person, not a workspace (they may belong to several). Self-service, no
// admin gate: see routes/tokens.js.
app.use('/api/tokens', requireAuth, tokenRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
// Deliberately NOT behind requireWorkspace — a stakeholder reaches this with
// no X-Workspace-Id header at all (often no workspace membership); it does
// its own per-project authorization (see projectSummary.js).
app.use('/api/project-summary', requireAuth, projectSummaryRoutes);
// Mounted before /api/tasks deliberately: attachmentRoutes owns paths like
// /api/tasks/:taskId/attachments, and Express's app.use(prefix, mw...) runs
// every middleware for ANY path under that prefix — including ones the
// router itself doesn't define — regardless of registration order within
// the router. If /api/tasks (with its requireWorkspace gate) were mounted
// first, it would intercept /api/tasks/:taskId/attachments requests before
// they ever reached this self-scoped router below, and 400 with "Missing or
// invalid X-Workspace-Id" even though attachments don't need that header at
// all (this actually happened — a real bug, not hypothetical; see git log).
app.use('/api', requireAuth, attachmentRoutes); // self-scopes per attachment/task, see routes/attachments.js
app.use('/api/projects', requireAuth, requireWorkspace, projectRoutes);
app.use('/api/tasks', requireAuth, requireWorkspace, taskRoutes);
app.use('/api/labels', requireAuth, requireWorkspace, labelRoutes);
app.use('/api/statuses', requireAuth, requireWorkspace, statusRoutes);
app.use('/api/priorities', requireAuth, requireWorkspace, priorityRoutes);
app.use('/api/sections', requireAuth, requireWorkspace, sectionRoutes);
app.use('/api/teams', requireAuth, requireWorkspace, teamRoutes);
app.use('/api/overview', requireAuth, requireWorkspace, overviewRoutes);

// The Claude/MCP connector — deliberately NOT under /api, and deliberately
// NOT behind requireWorkspace: a tool call carries its own workspace_id
// argument and checks access itself (see mcp/server.js), the same way
// project-summary and attachments are self-scoped. Authenticates via the
// same Authorization: Bearer <PAT> path requireAuth already supports —
// stateless (a fresh McpServer + transport per request, no session id), the
// pattern the SDK's own stateless example uses, since each request may
// belong to a different person and there's nothing here that needs
// server-initiated push between calls.
//
// withResourceMetadata sets WWW-Authenticate ahead of requireAuth so that,
// if requireAuth does end up sending its own 401, the header is already on
// the response (Express doesn't clear headers already set once a later
// handler calls res.status().json()) — this is what lets an MCP client that
// probes /mcp with no token yet auto-discover the OAuth flow below (see
// routes/oauth.js) instead of only ever offering the manual "Add header"
// path. Deliberately doesn't touch middleware/auth.js itself.
function withResourceMetadata(req, res, next) {
  res.set('WWW-Authenticate', `Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`);
  next();
}

app.post('/mcp', withResourceMetadata, requireAuth, async (req, res) => {
  try {
    const server = createMcpServer(req.user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});
// No session to resume or close in stateless mode — same 405 shape the
// SDK's own stateless example returns for these.
app.get('/mcp', withResourceMetadata, requireAuth, (req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});
app.delete('/mcp', withResourceMetadata, requireAuth, (req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

// Serve the built frontend (web/dist) in production / when present.
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Punchlist server listening on :${PORT}`);
});
