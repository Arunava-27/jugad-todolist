import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

function getOrCreateLabel(name) {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM labels WHERE name = ?').get(trimmed);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO labels (name) VALUES (?)').run(trimmed);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid);
}

function getOrCreateAssignee(name) {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM assignees WHERE name = ?').get(trimmed);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO assignees (name) VALUES (?)').run(trimmed);
  return db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid);
}

function setTaskLabels(taskId, names) {
  db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(taskId);
  if (!Array.isArray(names)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)');
  for (const name of names) {
    if (!name || !String(name).trim()) continue;
    const label = getOrCreateLabel(String(name));
    insert.run(taskId, label.id);
  }
}

function setTaskAssignees(taskId, names) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  if (!Array.isArray(names)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, assignee_id) VALUES (?, ?)');
  for (const name of names) {
    if (!name || !String(name).trim()) continue;
    const assignee = getOrCreateAssignee(String(name));
    insert.run(taskId, assignee.id);
  }
}

function hydrateTask(task) {
  const labels = db.prepare(
    `SELECT l.name FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ? ORDER BY l.name`
  ).all(task.id).map((r) => r.name);
  const assignees = db.prepare(
    `SELECT a.name FROM assignees a JOIN task_assignees ta ON ta.assignee_id = a.id WHERE ta.task_id = ? ORDER BY a.name`
  ).all(task.id).map((r) => r.name);
  return { ...task, is_completed: !!task.is_completed, labels, assignees };
}

router.get('/', (req, res) => {
  const { project_id, status, priority, label, assignee, completed, due_before, due_after, q } = req.query;
  let sql = 'SELECT DISTINCT t.* FROM tasks t';
  const joins = [];
  const where = [];
  const params = [];

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
  sql += where.length ? ` WHERE ${where.join(' AND ')}` : '';
  sql += ' ORDER BY t.is_completed ASC, (t.due_date IS NULL), t.due_date ASC, t.sort_order ASC, t.id ASC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(hydrateTask));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Task not found' });
  res.json(hydrateTask(row));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'title is required' });

  const info = db.prepare(
    `INSERT INTO tasks (project_id, title, description, status, priority, platform, due_date,
       estimate_hours, version, build_number, link, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.project_id || null, b.title.trim(), b.description || null, b.status || 'Not started',
    b.priority || null, b.platform || null, b.due_date || null, b.estimate_hours ?? null,
    b.version || null, b.build_number || null, b.link || null, b.sort_order ?? Date.now()
  );
  const id = info.lastInsertRowid;
  if (b.labels) setTaskLabels(id, b.labels);
  if (b.assignees) setTaskAssignees(id, b.assignees);
  res.status(201).json(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const b = req.body || {};
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
    updates.push('is_completed = ?');
    values.push(b.is_completed ? 1 : 0);
    updates.push('completed_at = ?');
    values.push(b.is_completed ? new Date().toISOString() : null);
    if (b.is_completed && !('status' in b)) {
      updates.push('status = ?');
      values.push('Done');
    }
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());

  if (updates.length) {
    values.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  if ('labels' in b) setTaskLabels(id, b.labels);
  if ('assignees' in b) setTaskAssignees(id, b.assignees);

  res.json(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
