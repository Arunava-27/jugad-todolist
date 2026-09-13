import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import db, { DATA_DIR } from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Server-generated name — never derived from user input beyond a sanitized
    // extension, so this is safe against path traversal regardless of what
    // the client sends as the original filename.
    const ext = path.extname(file.originalname || '').slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function attachmentUrl(a) {
  return `/api/attachments/${a.id}/file`;
}

// Attachments are reached by id (e.g. plain <img src>, which can't carry a
// custom X-Workspace-Id header), so authorization here is self-contained:
// resolve the workspace from the task the attachment/task belongs to and
// check membership directly, rather than relying on the requireWorkspace
// middleware used by the other data routes.
function canAccessWorkspace(user, workspaceId) {
  return !!roleFor(user, workspaceId);
}

function canWrite(user, workspaceId) {
  return atLeast(roleFor(user, workspaceId), 'developer');
}

function cleanupFiles(files) {
  for (const f of files || []) fs.unlink(f.path, () => {});
}

const router = Router();

router.post('/tasks/:taskId/attachments', (req, res) => {
  upload.array('files', 8)(req, res, (err) => {
    if (err) {
      cleanupFiles(req.files);
      return res.status(400).json({ error: err.message });
    }
    const taskId = Number(req.params.taskId);
    const task = db.prepare('SELECT id, workspace_id FROM tasks WHERE id = ?').get(taskId);
    if (!task || !canAccessWorkspace(req.user, task.workspace_id)) {
      cleanupFiles(req.files);
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canWrite(req.user, task.workspace_id)) {
      cleanupFiles(req.files);
      return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });
    }
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No file uploaded' });

    const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM attachments WHERE task_id = ?').get(taskId).m ?? -1;
    const insert = db.prepare(
      'INSERT INTO attachments (task_id, filename, original_name, mime_type, size, user_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const created = req.files.map((file, idx) => {
      const info = insert.run(taskId, file.filename, file.originalname, file.mimetype, file.size, req.user.id, maxOrder + 1 + idx);
      const row = db.prepare(
        `SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`
      ).get(info.lastInsertRowid);
      return { ...row, url: attachmentUrl(row) };
    });
    // Always an array, even for one file — keeps the frontend from needing a
    // single-vs-multi response-shape branch.
    res.status(201).json(created);
  });
});

router.get('/tasks/:taskId/attachments', (req, res) => {
  const taskId = Number(req.params.taskId);
  const task = db.prepare('SELECT id, workspace_id FROM tasks WHERE id = ?').get(taskId);
  if (!task || !canAccessWorkspace(req.user, task.workspace_id)) return res.status(404).json({ error: 'Task not found' });

  const rows = db.prepare(
    `SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.sort_order, a.created_at`
  ).all(taskId);
  res.json(rows.map((r) => ({ ...r, url: attachmentUrl(r) })));
});

router.get('/attachments/:id/file', (req, res) => {
  const row = db.prepare(
    `SELECT a.*, t.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?`
  ).get(Number(req.params.id));
  if (!row || !canAccessWorkspace(req.user, row.workspace_id)) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  if (req.query.download === '1') {
    // Strip quotes/newlines from the suggested filename — it's user-supplied
    // (the original upload name) and goes straight into a response header.
    const safeName = String(row.original_name || 'attachment').replace(/["\r\n]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  }
  res.sendFile(filePath);
});

// Caption edit — the uploader themselves, or a manager+, can annotate an
// image; nobody else (and never a viewer, regardless of who uploaded it —
// a demoted former-developer doesn't keep write access to their old work).
router.patch('/attachments/:id', (req, res) => {
  const row = db.prepare(
    `SELECT a.*, t.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?`
  ).get(Number(req.params.id));
  if (!row || !canAccessWorkspace(req.user, row.workspace_id)) return res.status(404).json({ error: 'Not found' });
  if (!canWrite(req.user, row.workspace_id)) return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });

  const isUploader = row.user_id === req.user.id;
  const isManager = atLeast(roleFor(req.user, row.workspace_id), 'manager');
  if (!isUploader && !isManager) {
    return res.status(403).json({ error: 'Only whoever uploaded this, or a manager, admin, or owner, can edit it' });
  }

  if ('caption' in (req.body || {})) {
    const caption = String(req.body.caption || '').trim().slice(0, 500) || null;
    db.prepare('UPDATE attachments SET caption = ? WHERE id = ?').run(caption, row.id);
  }
  const updated = db.prepare(
    `SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`
  ).get(row.id);
  res.json({ ...updated, url: attachmentUrl(updated) });
});

// Persists a new drag-to-reorder order for one task's attachment grid.
router.patch('/tasks/:taskId/attachments/reorder', (req, res) => {
  const taskId = Number(req.params.taskId);
  const task = db.prepare('SELECT id, workspace_id FROM tasks WHERE id = ?').get(taskId);
  if (!task || !canAccessWorkspace(req.user, task.workspace_id)) return res.status(404).json({ error: 'Task not found' });
  if (!canWrite(req.user, task.workspace_id)) return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });

  const order = Array.isArray(req.body?.order) ? req.body.order.map(Number) : [];
  if (!order.length) return res.status(400).json({ error: 'order is required' });

  // Only ever reorder attachments that actually belong to this task — an id
  // that doesn't is silently skipped rather than trusted wholesale.
  const validIds = new Set(db.prepare('SELECT id FROM attachments WHERE task_id = ?').all(taskId).map((r) => r.id));
  const updateOrder = db.prepare('UPDATE attachments SET sort_order = ? WHERE id = ? AND task_id = ?');
  order.forEach((id, idx) => {
    if (validIds.has(id)) updateOrder.run(idx, id, taskId);
  });

  const rows = db.prepare(
    `SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.sort_order, a.created_at`
  ).all(taskId);
  res.json(rows.map((r) => ({ ...r, url: attachmentUrl(r) })));
});

router.delete('/attachments/:id', (req, res) => {
  const row = db.prepare(
    `SELECT a.*, t.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?`
  ).get(Number(req.params.id));
  if (!row || !canAccessWorkspace(req.user, row.workspace_id)) return res.status(404).json({ error: 'Not found' });
  if (!canWrite(req.user, row.workspace_id)) return res.status(403).json({ error: 'Viewers have read-only access to this workspace' });
  db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id);
  fs.unlink(path.join(UPLOAD_DIR, row.filename), () => {});
  res.json({ ok: true });
});

export default router;
