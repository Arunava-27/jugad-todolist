import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import db, { DATA_DIR } from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';
import { secretEncryptionConfigured, encryptBuffer, decryptBuffer, encryptSecretValue, decryptSecretValue } from '../lib/secretCrypto.js';

const SECRETS_DIR = path.join(DATA_DIR, 'secrets');
if (!fs.existsSync(SECRETS_DIR)) fs.mkdirSync(SECRETS_DIR, { recursive: true });

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — files are buffered through Node for encryption, unlike attachments' pass-through storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

const router = Router();

function projectInWorkspace(projectId, workspaceId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, workspaceId);
}

// Mirrors teams.js's teamInWorkspace — resolves a secret only if it belongs
// to a project in the caller's own workspace, regardless of role.
function secretInWorkspace(secretId, workspaceId) {
  return db.prepare(
    `SELECT s.* FROM project_secrets s JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND p.workspace_id = ?`
  ).get(secretId, workspaceId);
}

function shareFor(secretId, userId) {
  return db.prepare('SELECT * FROM project_secret_shares WHERE secret_id = ? AND user_id = ?').get(secretId, userId);
}

function logAccess({ secretId, projectId, secretLabel, userId, action }) {
  db.prepare(
    'INSERT INTO project_secret_access_log (secret_id, project_id, secret_label, user_id, action) VALUES (?, ?, ?, ?, ?)'
  ).run(secretId, projectId, secretLabel, userId, action);
}

function secretLabel(row) {
  return row.kind === 'file' ? row.file_name : row.key_name;
}

// The shape returned by the list endpoint and after create/update — never
// value_encrypted or file_path. share is the caller's own share row when
// they're not manager+ (null for a manager+, who sees everything without
// needing one); shareCount is manager-only (how many people it's shared with).
function publicSecret(row, { share = null, shareCount = null } = {}) {
  const base = {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    key_name: row.key_name,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    notes: row.notes,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (share) {
    base.shared_with_me = true;
    base.can_reshare = !!share.can_reshare;
    base.shared_by_name = row.shared_by_name;
    base.shared_at = share.shared_at;
  }
  if (shareCount !== null) base.share_count = shareCount;
  return base;
}

// Manager+ can act on any secret in the project outright. Anyone else needs
// an explicit share row, AND must not be a viewer — a decrypted secret
// value is a materially bigger risk than ordinary task visibility, so this
// is a deliberate extra restriction beyond the normal role table (a viewer
// stays excluded even if someone shares a secret with them).
function accessLevel(req, secret) {
  if (atLeast(req.workspaceRole, 'manager')) return { ok: true, isManager: true, share: null };
  if (req.workspaceRole === 'viewer') return { ok: false };
  const share = shareFor(secret.id, req.user.id);
  return share ? { ok: true, isManager: false, share } : { ok: false };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }
  // Viewer role is excluded entirely, even from the list — not just from
  // revealing a value. A decrypted secret's very existence/key_name is
  // itself sensitive (e.g. "STRIPE_LIVE_SECRET_KEY").
  if (req.workspaceRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot access project secrets' });

  if (atLeast(req.workspaceRole, 'manager')) {
    const rows = db.prepare(
      `SELECT s.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM project_secret_shares sh WHERE sh.secret_id = s.id) as share_count
       FROM project_secrets s LEFT JOIN users u ON u.id = s.created_by
       WHERE s.project_id = ? ORDER BY s.created_at DESC`
    ).all(projectId);
    return res.json(rows.map((r) => publicSecret(r, { shareCount: r.share_count })));
  }

  // Non-manager, non-viewer: only what's been explicitly shared with them.
  const rows = db.prepare(
    `SELECT s.*, u.name as created_by_name, sh.can_reshare, sh.shared_at, sb.name as shared_by_name
     FROM project_secret_shares sh
     JOIN project_secrets s ON s.id = sh.secret_id
     LEFT JOIN users u ON u.id = s.created_by
     LEFT JOIN users sb ON sb.id = sh.shared_by
     WHERE sh.user_id = ? AND s.project_id = ? ORDER BY sh.shared_at DESC`
  ).all(req.user.id, projectId);
  res.json(rows.map((r) => publicSecret(r, { share: { can_reshare: r.can_reshare, shared_at: r.shared_at } })));
});

// ---------------------------------------------------------------------------
// Create — kv (JSON) and file (multipart) are separate routes, same split
// attachments.js draws between JSON-bodied routes and its multer route.
// ---------------------------------------------------------------------------

router.post('/', (req, res) => {
  const projectId = Number(req.body?.project_id);
  if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
    return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
  }
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can create a secret' });

  const keyName = String(req.body?.key_name || '').trim();
  const value = req.body?.value;
  if (!keyName) return res.status(400).json({ error: 'key_name is required' });
  if (value === undefined || value === null || value === '') return res.status(400).json({ error: 'value is required' });
  if (!secretEncryptionConfigured()) {
    return res.status(500).json({ error: 'This server is not yet configured for secrets — SECRET_MASTER_KEY is unset. Ask whoever manages the deployment to set it.' });
  }

  const notes = req.body?.notes ? String(req.body.notes).trim().slice(0, 1000) : null;
  const valueEncrypted = encryptSecretValue(String(value));
  const info = db.prepare(
    `INSERT INTO project_secrets (project_id, kind, key_name, value_encrypted, notes, created_by)
     VALUES (?, 'kv', ?, ?, ?, ?)`
  ).run(projectId, keyName, valueEncrypted, notes, req.user.id);

  const row = db.prepare(
    `SELECT s.*, u.name as created_by_name FROM project_secrets s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?`
  ).get(info.lastInsertRowid);
  logAccess({ secretId: row.id, projectId, secretLabel: secretLabel(row), userId: req.user.id, action: 'created' });
  res.status(201).json(publicSecret(row));
});

router.post('/files', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const projectId = Number(req.body?.project_id);
    if (!projectId || !projectInWorkspace(projectId, req.workspaceId)) {
      return res.status(400).json({ error: 'project_id is required and must belong to this workspace' });
    }
    if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can create a secret' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!secretEncryptionConfigured()) {
      return res.status(500).json({ error: 'This server is not yet configured for secrets — SECRET_MASTER_KEY is unset. Ask whoever manages the deployment to set it.' });
    }

    const notes = req.body?.notes ? String(req.body.notes).trim().slice(0, 1000) : null;
    const storedName = crypto.randomUUID();
    fs.writeFileSync(path.join(SECRETS_DIR, storedName), encryptBuffer(req.file.buffer));

    const info = db.prepare(
      `INSERT INTO project_secrets (project_id, kind, file_name, file_path, file_size, mime_type, notes, created_by)
       VALUES (?, 'file', ?, ?, ?, ?, ?, ?)`
    ).run(projectId, req.file.originalname, storedName, req.file.size, req.file.mimetype, notes, req.user.id);

    const row = db.prepare(
      `SELECT s.*, u.name as created_by_name FROM project_secrets s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?`
    ).get(info.lastInsertRowid);
    logAccess({ secretId: row.id, projectId, secretLabel: secretLabel(row), userId: req.user.id, action: 'created' });
    res.status(201).json(publicSecret(row));
  });
});

// ---------------------------------------------------------------------------
// Reveal / download — the only two places a value or file ever leaves the
// server decrypted, and the only two places that log 'viewed'/'downloaded'.
// A secret that exists but isn't shared with this (non-manager) caller 404s,
// same as one that doesn't exist at all — never 403, which would itself
// confirm the id belongs to a real secret.
// ---------------------------------------------------------------------------

router.get('/:id/reveal', (req, res) => {
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });
  const access = accessLevel(req, secret);
  if (!access.ok) return res.status(404).json({ error: 'Secret not found' });
  if (secret.kind !== 'kv') return res.status(400).json({ error: 'This secret is a file — use download instead' });
  if (!secretEncryptionConfigured()) return res.status(500).json({ error: 'This server is not configured to decrypt secrets right now.' });

  const value = decryptSecretValue(secret.value_encrypted);
  logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'viewed' });
  res.json({ value });
});

router.get('/:id/download', (req, res) => {
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });
  const access = accessLevel(req, secret);
  if (!access.ok) return res.status(404).json({ error: 'Secret not found' });
  if (secret.kind !== 'file') return res.status(400).json({ error: 'This secret is a key/value pair — use reveal instead' });
  if (!secretEncryptionConfigured()) return res.status(500).json({ error: 'This server is not configured to decrypt secrets right now.' });

  const filePath = path.join(SECRETS_DIR, secret.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Secret not found' });
  const plaintext = decryptBuffer(fs.readFileSync(filePath));
  logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'downloaded' });

  const safeName = String(secret.file_name || 'secret').replace(/["\r\n]/g, '');
  res.setHeader('Content-Type', secret.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(plaintext);
});

// ---------------------------------------------------------------------------
// Update / delete — manager+ only, checked before the secret is even looked
// up, so a non-manager gets the same 403 regardless of whether the id exists.
// ---------------------------------------------------------------------------

router.patch('/:id', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can edit a secret' });
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });

  const fields = [];
  const values = [];
  if (req.body?.notes !== undefined) {
    fields.push('notes = ?');
    values.push(req.body.notes ? String(req.body.notes).trim().slice(0, 1000) : null);
  }
  if (secret.kind === 'kv' && req.body?.key_name !== undefined && String(req.body.key_name).trim()) {
    fields.push('key_name = ?');
    values.push(String(req.body.key_name).trim());
  }
  if (secret.kind === 'kv' && req.body?.value !== undefined && req.body.value !== '') {
    if (!secretEncryptionConfigured()) return res.status(500).json({ error: 'This server is not configured to encrypt secrets right now.' });
    fields.push('value_encrypted = ?');
    values.push(encryptSecretValue(String(req.body.value)));
  }
  if (fields.length) {
    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(secret.id);
    db.prepare(`UPDATE project_secrets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'updated' });
  }

  const row = db.prepare(
    `SELECT s.*, u.name as created_by_name FROM project_secrets s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?`
  ).get(secret.id);
  res.json(publicSecret(row));
});

router.delete('/:id', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a secret' });
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });

  // Log first, then delete — the FK on project_secret_access_log.secret_id
  // is ON DELETE SET NULL, so this row survives the delete below with its
  // secret_id nulled out and secret_label already snapshotted.
  logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'deleted' });
  db.prepare('DELETE FROM project_secrets WHERE id = ?').run(secret.id); // shares cascade
  if (secret.kind === 'file' && secret.file_path) {
    fs.unlink(path.join(SECRETS_DIR, secret.file_path), () => {});
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Shares — manager+ always; a sharee with can_reshare=1 may manage THIS
// secret's shares only (never its value, never its deletion).
// ---------------------------------------------------------------------------

function canManageShares(req, secret) {
  if (atLeast(req.workspaceRole, 'manager')) return true;
  const share = shareFor(secret.id, req.user.id);
  return !!share?.can_reshare;
}

router.get('/:id/shares', (req, res) => {
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });
  if (!canManageShares(req, secret)) return res.status(403).json({ error: 'Not allowed to view this secret\'s shares' });

  const rows = db.prepare(
    `SELECT sh.*, u.name, u.email, sb.name as shared_by_name
     FROM project_secret_shares sh JOIN users u ON u.id = sh.user_id LEFT JOIN users sb ON sb.id = sh.shared_by
     WHERE sh.secret_id = ? ORDER BY sh.shared_at`
  ).all(secret.id);
  res.json(rows.map((r) => ({
    user_id: r.user_id, name: r.name, email: r.email, can_reshare: !!r.can_reshare,
    shared_by_name: r.shared_by_name, shared_at: r.shared_at,
  })));
});

router.post('/:id/shares', (req, res) => {
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });
  if (!canManageShares(req, secret)) return res.status(403).json({ error: 'Not allowed to share this secret' });

  const userId = Number(req.body?.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const realRole = targetUser ? roleFor(targetUser, req.workspaceId) : null;
  if (!targetUser || !realRole) return res.status(400).json({ error: 'That person is not a member of this workspace' });
  if (realRole === 'viewer') return res.status(400).json({ error: 'Viewers cannot be granted access to secrets' });

  const canReshare = req.body?.can_reshare ? 1 : 0;
  db.prepare(
    `INSERT INTO project_secret_shares (secret_id, user_id, can_reshare, shared_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (secret_id, user_id) DO UPDATE SET can_reshare = excluded.can_reshare`
  ).run(secret.id, userId, canReshare, req.user.id);
  logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'shared' });

  res.status(201).json({ ok: true });
});

router.delete('/:id/shares/:userId', (req, res) => {
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });
  if (!canManageShares(req, secret)) return res.status(403).json({ error: 'Not allowed to manage this secret\'s shares' });

  db.prepare('DELETE FROM project_secret_shares WHERE secret_id = ? AND user_id = ?').run(secret.id, Number(req.params.userId));
  logAccess({ secretId: secret.id, projectId: secret.project_id, secretLabel: secretLabel(secret), userId: req.user.id, action: 'unshared' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Access log — manager+ only; the audit trail isn't visible to whoever it's
// auditing, same reasoning as everywhere else access control appears here.
// ---------------------------------------------------------------------------

router.get('/:id/access-log', (req, res) => {
  if (!atLeast(req.workspaceRole, 'manager')) return res.status(403).json({ error: 'Only a manager, admin, or owner can view the access log' });
  const secret = secretInWorkspace(Number(req.params.id), req.workspaceId);
  if (!secret) return res.status(404).json({ error: 'Secret not found' });

  const rows = db.prepare(
    `SELECT l.*, u.name as user_name FROM project_secret_access_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.secret_id = ? ORDER BY l.created_at DESC`
  ).all(secret.id);
  res.json(rows);
});

export default router;
