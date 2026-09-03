import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db, { DATA_DIR } from '../db/index.js';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const router = Router();

function getOrCreateLabel(workspaceId, name) {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM labels WHERE workspace_id = ? AND name = ?').get(workspaceId, trimmed);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO labels (workspace_id, name) VALUES (?, ?)').run(workspaceId, trimmed);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid);
}

function getOrCreateAssignee(workspaceId, name) {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM assignees WHERE workspace_id = ? AND name = ?').get(workspaceId, trimmed);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO assignees (workspace_id, name) VALUES (?, ?)').run(workspaceId, trimmed);
  return db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid);
}

function setTaskLabels(workspaceId, taskId, names) {
  db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(taskId);
  if (!Array.isArray(names)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
  for (const name of names) {
    if (!name || !String(name).trim()) continue;
    const label = getOrCreateLabel(workspaceId, String(name));
    insert.run(taskId, label.id);
  }
}

function setTaskAssignees(workspaceId, taskId, names) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  if (!Array.isArray(names)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, assignee_id) VALUES (?, ?)');
  for (const name of names) {
    if (!name || !String(name).trim()) continue;
    const assignee = getOrCreateAssignee(workspaceId, String(name));
    insert.run(taskId, assignee.id);
  }
}

function hydrateTask(task) {
  const labels = db.prepare(
    `SELECT l.name, l.color FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ? ORDER BY l.name`
  ).all(task.id);
  const assignees = db.prepare(
    `SELECT a.name, a.color FROM assignees a JOIN task_assignees ta ON ta.assignee_id = a.id WHERE ta.task_id = ? ORDER BY a.name`
  ).all(task.id);
  const attachments = db.prepare(
    `SELECT id, original_name, mime_type, size, created_at FROM attachments WHERE task_id = ? ORDER BY created_at`
  ).all(task.id).map((a) => ({ ...a, url: `/api/attachments/${a.id}/file` }));
  return { ...task, is_completed: !!task.is_completed, labels, assignees, attachments };
}

function defaultStatusName(workspaceId) {
  const row = db.prepare('SELECT name FROM statuses WHERE workspace_id = ? AND is_default = 1 ORDER BY sort_order LIMIT 1').get(workspaceId)
    || db.prepare('SELECT name FROM statuses WHERE workspace_id = ? ORDER BY sort_order LIMIT 1').get(workspaceId);
  return row?.name || 'Not started';
}

function isDoneStatus(workspaceId, name) {
  return !!db.prepare('SELECT is_done FROM statuses WHERE workspace_id = ? AND name = ?').get(workspaceId, name)?.is_done;
}

router.get('/', (req, res) => {
  const { project_id, status, priority, label, assignee, completed, due_before, due_after, q } = req.query;
  let sql = 'SELECT DISTINCT t.* FROM tasks t';
  const joins = [];
  const where = ['t.workspace_id = ?'];
  const params = [req.workspaceId];

  if (label) {
    joins.push('JOIN task_labels tl ON tl.task_id = t.id JOIN labels l ON l.id = tl.label_id');
    where.push('l.name = ?');
    params.push(label);
  }
  if (assignee) {
    joins.push('JOIN task_assignees ta ON ta.task_id = t.id JOIN assignees a ON a.id = ta.assignee_id');
    where.push('a.name = ?');
    params.push(assignee);
  }
  if (project_id === 'none') {
    where.push('t.project_id IS NULL');
  } else if (project_id) {
    where.push('t.project_id = ?');
    params.push(Number(project_id));
  }
  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (priority) {
    where.push('t.priority = ?');
    params.push(priority);
  }
  if (completed === '1') where.push('t.is_completed = 1');
  if (completed === '0') where.push('t.is_completed = 0');
  if (due_before) {
    where.push('t.due_date IS NOT NULL AND t.due_date <= ?');
    params.push(due_before);
  }
  if (due_after) {
    where.push('t.due_date IS NOT NULL AND t.due_date >= ?');
    params.push(due_after);
  }
  if (q) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += joins.length ? ` ${joins.join(' ')}` : '';
  sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' ORDER BY t.is_completed ASC, (t.due_date IS NULL), t.due_date ASC, t.sort_order ASC, t.id ASC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(hydrateTask));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(Number(req.params.id), req.workspaceId);
  if (!row) return res.status(404).json({ error: 'Task not found' });
  res.json(hydrateTask(row));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'title is required' });

  let projectId = b.project_id || null;
  if (projectId) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, req.workspaceId);
    if (!project) return res.status(400).json({ error: 'Project not found in this workspace' });
  }

  const info = db.prepare(
    `INSERT INTO tasks (workspace_id, project_id, title, description, status, priority, platform, due_date,
       estimate_hours, version, build_number, link, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.workspaceId, projectId, b.title.trim(), b.description || null, b.status || defaultStatusName(req.workspaceId),
    b.priority || null, b.platform || null, b.due_date || null, b.estimate_hours ?? null,
    b.version || null, b.build_number || null, b.link || null, b.sort_order ?? Date.now()
  );
  const id = info.lastInsertRowid;
  if (b.labels) setTaskLabels(req.workspaceId, id, b.labels);
  if (b.assignees) setTaskAssignees(req.workspaceId, id, b.assignees);
  res.status(201).json(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const b = req.body || {};

  if ('project_id' in b && b.project_id) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(b.project_id, req.workspaceId);
    if (!project) return res.status(400).json({ error: 'Project not found in this workspace' });
  }

  const fields = ['project_id', 'title', 'description', 'status', 'priority', 'platform',
    'due_date', 'estimate_hours', 'version', 'build_number', 'link', 'sort_order'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (f in b) {
      updates.push(`${f} = ?`);
      values.push(b[f]);
    }
  }

  if ('is_completed' in b) {
    const completing = !!b.is_completed;
    updates.push('is_completed = ?');
    values.push(completing ? 1 : 0);
    updates.push('completed_at = ?');
    values.push(completing ? new Date().toISOString() : null);
    if (!('status' in b)) {
      if (completing) {
        const done = db.prepare('SELECT name FROM statuses WHERE workspace_id = ? AND is_done = 1 ORDER BY sort_order LIMIT 1').get(req.workspaceId);
        if (done) { updates.push('status = ?'); values.push(done.name); }
      } else if (isDoneStatus(req.workspaceId, existing.status)) {
        updates.push('status = ?');
        values.push(defaultStatusName(req.workspaceId));
      }
    }
  } else if ('status' in b) {
    // Explicit status change (board drag, modal save) without an explicit completion
    // flag: derive is_completed from whether the target status is marked "done".
    const done = isDoneStatus(req.workspaceId, b.status);
    updates.push('is_completed = ?');
    values.push(done ? 1 : 0);
    updates.push('completed_at = ?');
    values.push(done ? new Date().toISOString() : null);
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());

  if (updates.length) {
    values.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  if ('labels' in b) setTaskLabels(req.workspaceId, id, b.labels);
  if ('assignees' in b) setTaskAssignees(req.workspaceId, id, b.assignees);

  res.json(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  // Attachment rows cascade via FK, but the files on disk don't — clean those up first.
  const files = db.prepare('SELECT filename FROM attachments WHERE task_id = ?').all(id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  for (const f of files) fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {});
  res.json({ ok: true });
});

export default router;
