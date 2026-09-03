import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import db, { DATA_DIR } from '../db/index.js';

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

const router = Router();

router.post('/tasks/:taskId/attachments', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const taskId = Number(req.params.taskId);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const info = db.prepare(
      'INSERT INTO attachments (task_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)'
    ).run(taskId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...row, url: attachmentUrl(row) });
  });
});

router.get('/tasks/:taskId/attachments', (req, res) => {
  const rows = db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at').all(Number(req.params.taskId));
  res.json(rows.map((r) => ({ ...r, url: attachmentUrl(r) })));
});

router.get('/attachments/:id/file', (req, res) => {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

router.delete('/attachments/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id);
  fs.unlink(path.join(UPLOAD_DIR, row.filename), () => {});
  res.json({ ok: true });
});

export default router;
