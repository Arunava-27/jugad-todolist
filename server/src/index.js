import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import labelRoutes from './routes/labels.js';
import assigneeRoutes from './routes/assignees.js';
import statusRoutes from './routes/statuses.js';
import priorityRoutes from './routes/priorities.js';
import attachmentRoutes from './routes/attachments.js';
import { requireAuth } from './middleware/auth.js';
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

app.use('/api/auth', authRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/labels', requireAuth, labelRoutes);
app.use('/api/assignees', requireAuth, assigneeRoutes);
app.use('/api/statuses', requireAuth, statusRoutes);
app.use('/api/priorities', requireAuth, priorityRoutes);
app.use('/api', requireAuth, attachmentRoutes);

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
  console.log(`jugad-todolist server listening on :${PORT}`);
});
