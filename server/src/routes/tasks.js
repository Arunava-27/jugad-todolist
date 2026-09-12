import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db, { DATA_DIR } from '../db/index.js';
import { roleFor, atLeast } from '../lib/permissions.js';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const router = Router();

function getOrCreateLabel(workspaceId, name) {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM labels WHERE workspace_id = ? AND name = ?').get(workspaceId, trimmed);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO labels (workspace_id, name) VALUES (?, ?)').run(workspaceId, trimmed);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid);
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

// Assigns a task to real accounts (must belong to this workspace — anyone
// else in the id list is silently dropped rather than failing the whole
// save, since a stale/removed member's id is a normal thing to encounter).
function setTaskMembers(workspaceId, taskId, userIds) {
  db.prepare('DELETE FROM task_members WHERE task_id = ?').run(taskId);
  if (!Array.isArray(userIds)) return;
  const insert = db.prepare('INSERT OR IGNORE INTO task_members (task_id, user_id) VALUES (?, ?)');
  for (const raw of userIds) {
    const userId = Number(raw);
    if (!userId) continue;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !roleFor(user, workspaceId)) continue;
    insert.run(taskId, userId);
  }
}

// Assigning a task to someone else is a manager+ action (the same tier that
// runs projects/sections) — but assigning or unassigning *yourself* stays
// open to everyone non-viewer, since self-service pickup ("I'll take this")
// shouldn't need a manager in the loop. Only true additions/removals of
// someone other than the requester trigger the higher bar.
function requiresManagerForAssignment(userId, requestedIds, currentIds) {
  const adds = requestedIds.filter((uid) => !currentIds.includes(uid));
  const removes = currentIds.filter((uid) => !requestedIds.includes(uid));
  return [...adds, ...removes].some((uid) => uid !== userId);
}

// System-logged change history + human comments, interleaved on one
// timeline. `meta` is stored as JSON text; callers pass a plain object.
function logActivity(taskId, userId, type, meta) {
  db.prepare('INSERT INTO task_activity (task_id, user_id, type, meta) VALUES (?, ?, ?, ?)')
    .run(taskId, userId || null, type, meta ? JSON.stringify(meta) : null);
}

function hydrateTask(task) {
  const labels = db.prepare(
    `SELECT l.name, l.color FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ? ORDER BY l.name`
  ).all(task.id);
  const members = db.prepare(
    `SELECT u.id, u.name, u.email FROM users u JOIN task_members tm ON tm.user_id = u.id WHERE tm.task_id = ? ORDER BY u.name COLLATE NOCASE`
  ).all(task.id);
  const attachments = db.prepare(
    `SELECT id, original_name, mime_type, size, created_at FROM attachments WHERE task_id = ? ORDER BY created_at`
  ).all(task.id).map((a) => ({ ...a, url: `/api/attachments/${a.id}/file` }));
  const subtaskStats = db.prepare(
    `SELECT COUNT(*) total, COALESCE(SUM(is_completed), 0) completed FROM tasks WHERE parent_task_id = ?`
  ).get(task.id);
  return {
    ...task,
    is_completed: !!task.is_completed,
    labels,
    members,
    attachments,
    subtask_count: subtaskStats.total,
    subtask_completed_count: subtaskStats.completed,
  };
}

function defaultStatusName(workspaceId) {
  const row = db.prepare('SELECT name FROM statuses WHERE workspace_id = ? AND is_default = 1 ORDER BY sort_order LIMIT 1').get(workspaceId)
    || db.prepare('SELECT name FROM statuses WHERE workspace_id = ? ORDER BY sort_order LIMIT 1').get(workspaceId);
  return row?.name || 'Not started';
}

function isDoneStatus(workspaceId, name) {
  return !!db.prepare('SELECT is_done FROM statuses WHERE workspace_id = ? AND name = ?').get(workspaceId, name)?.is_done;
}

// A section belongs to exactly one project — a task's section must match its
// own project (or both must be empty/null).
function sectionMatchesProject(sectionId, projectId) {
  if (!sectionId) return true;
  const section = db.prepare('SELECT project_id FROM sections WHERE id = ?').get(sectionId);
  return !!section && section.project_id === projectId;
}

router.get('/', (req, res) => {
  const { project_id, status, priority, label, member_id, completed, due_before, due_after, q, parent_task_id, include_subtasks } = req.query;
  let sql = 'SELECT DISTINCT t.* FROM tasks t';
  const joins = [];
  const where = ['t.workspace_id = ?'];
  const params = [req.workspaceId];

  if (label) {
    joins.push('JOIN task_labels tl ON tl.task_id = t.id JOIN labels l ON l.id = tl.label_id');
    where.push('l.name = ?');
    params.push(label);
  }
  if (member_id) {
    joins.push('JOIN task_members tm ON tm.task_id = t.id');
    where.push('tm.user_id = ?');
    params.push(Number(member_id));
  }
  if (project_id === 'none') {
    where.push('t.project_id IS NULL');
  } else if (project_id) {
    where.push('t.project_id = ?');
    params.push(Number(project_id));
  }
  if (req.query.section_id === 'none') {
    where.push('t.section_id IS NULL');
  } else if (req.query.section_id) {
    where.push('t.section_id = ?');
    params.push(Number(req.query.section_id));
  }
  if (parent_task_id) {
    // Fetching one task's sub-tasks specifically.
    where.push('t.parent_task_id = ?');
    params.push(Number(parent_task_id));
  } else if (!include_subtasks) {
    // Every other listing (Today, a project, search, ...) is top-level only
    // by default — sub-tasks show inside their parent's task modal, not as
    // their own rows cluttering the main views.
    where.push('t.parent_task_id IS NULL');
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

// Resolves & validates a requested parent task, returning it (or null if
// none requested). Only one level of nesting is allowed — a sub-task can't
// itself have sub-tasks — which keeps the UI (a flat checklist inside the
// parent's modal) simple and unambiguous.
function resolveParent(parentTaskId, workspaceId) {
  if (!parentTaskId) return { parent: null, error: null };
  const parent = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(parentTaskId, workspaceId);
  if (!parent) return { parent: null, error: 'Parent task not found in this workspace' };
  if (parent.parent_task_id) return { parent: null, error: 'A sub-task cannot itself have sub-tasks' };
  return { parent, error: null };
}

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'title is required' });

  const { parent, error: parentError } = resolveParent(b.parent_task_id ? Number(b.parent_task_id) : null, req.workspaceId);
  if (parentError) return res.status(400).json({ error: parentError });

  // Sub-tasks always live under their parent's project, not shown in any
  // section list (they're hidden from top-level views anyway).
  let projectId = parent ? parent.project_id : (b.project_id || null);
  let sectionId = parent ? null : (b.section_id || null);
  if (projectId && !parent) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, req.workspaceId);
    if (!project) return res.status(400).json({ error: 'Project not found in this workspace' });
  }
  if (sectionId && !sectionMatchesProject(sectionId, projectId)) {
    return res.status(400).json({ error: "section_id must belong to the task's project" });
  }

  if (b.member_ids) {
    const requestedIds = Array.isArray(b.member_ids) ? b.member_ids.map(Number) : [];
    if (requiresManagerForAssignment(req.user.id, requestedIds, []) && !atLeast(req.workspaceRole, 'manager')) {
      return res.status(403).json({ error: 'Only a manager, admin, or owner can assign this task to someone else' });
    }
  }

  const info = db.prepare(
    `INSERT INTO tasks (workspace_id, project_id, section_id, parent_task_id, title, description, status, priority, platform, due_date,
       estimate_hours, version, build_number, link, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.workspaceId, projectId, sectionId, parent?.id || null, b.title.trim(), b.description || null, b.status || defaultStatusName(req.workspaceId),
    b.priority || null, b.platform || null, b.due_date || null, b.estimate_hours ?? null,
    b.version || null, b.build_number || null, b.link || null, b.sort_order ?? Date.now()
  );
  const id = info.lastInsertRowid;
  if (b.labels) setTaskLabels(req.workspaceId, id, b.labels);
  if (b.member_ids) setTaskMembers(req.workspaceId, id, b.member_ids);
  logActivity(id, req.user.id, 'created');
  res.status(201).json(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const b = req.body || {};

  // Captured up front (before any writes) so it can both gate the
  // manager-only "assigning someone else" check below and, later, drive the
  // added/removed activity-log diff without re-querying.
  const oldMemberIds = 'member_ids' in b
    ? db.prepare('SELECT user_id FROM task_members WHERE task_id = ?').all(id).map((r) => r.user_id)
    : [];
  if ('member_ids' in b) {
    const requestedIds = Array.isArray(b.member_ids) ? b.member_ids.map(Number) : [];
    if (requiresManagerForAssignment(req.user.id, requestedIds, oldMemberIds) && !atLeast(req.workspaceRole, 'manager')) {
      return res.status(403).json({ error: 'Only a manager, admin, or owner can assign this task to someone else — you can still assign or unassign yourself' });
    }
  }

  if ('parent_task_id' in b && b.parent_task_id) {
    if (Number(b.parent_task_id) === id) return res.status(400).json({ error: 'A task cannot be its own parent' });
    const { parent, error: parentError } = resolveParent(Number(b.parent_task_id), req.workspaceId);
    if (parentError) return res.status(400).json({ error: parentError });
    const hasOwnSubtasks = db.prepare('SELECT 1 FROM tasks WHERE parent_task_id = ?').get(id);
    if (hasOwnSubtasks) return res.status(400).json({ error: "This task has its own sub-tasks and can't become one itself" });
    b.project_id = parent.project_id;
    b.section_id = null;
  }

  if ('project_id' in b && b.project_id) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(b.project_id, req.workspaceId);
    if (!project) return res.status(400).json({ error: 'Project not found in this workspace' });
  }
  if ('section_id' in b && b.section_id) {
    const effectiveProjectId = 'project_id' in b ? b.project_id : existing.project_id;
    if (!sectionMatchesProject(b.section_id, effectiveProjectId)) {
      return res.status(400).json({ error: "section_id must belong to the task's project" });
    }
  } else if ('project_id' in b && b.project_id !== existing.project_id) {
    // Moving to a different (or no) project — the old section_id no longer
    // applies unless the caller explicitly set a new one above.
    b.section_id = null;
  }

  const fields = ['project_id', 'section_id', 'parent_task_id', 'title', 'description', 'status', 'priority', 'platform',
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
  if ('member_ids' in b) setTaskMembers(req.workspaceId, id, b.member_ids);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  if ('status' in b && b.status !== existing.status) {
    logActivity(id, req.user.id, 'status', { from: existing.status, to: b.status });
  }
  if ('priority' in b && b.priority !== existing.priority) {
    logActivity(id, req.user.id, 'priority', { from: existing.priority, to: b.priority });
  }
  if ('due_date' in b && (b.due_date || null) !== (existing.due_date || null)) {
    logActivity(id, req.user.id, 'due_date', { from: existing.due_date, to: b.due_date });
  }
  if (!!updated.is_completed !== !!existing.is_completed) {
    logActivity(id, req.user.id, updated.is_completed ? 'completed' : 'reopened');
  }
  if ('member_ids' in b) {
    const newMemberIds = db.prepare('SELECT user_id FROM task_members WHERE task_id = ?').all(id).map((r) => r.user_id);
    for (const uid of newMemberIds) {
      if (!oldMemberIds.includes(uid)) {
        const u = db.prepare('SELECT name FROM users WHERE id = ?').get(uid);
        logActivity(id, req.user.id, 'assignee_added', { name: u?.name || 'Someone' });
      }
    }
    for (const uid of oldMemberIds) {
      if (!newMemberIds.includes(uid)) {
        const u = db.prepare('SELECT name FROM users WHERE id = ?').get(uid);
        logActivity(id, req.user.id, 'assignee_removed', { name: u?.name || 'Someone' });
      }
    }
  }

  res.json(hydrateTask(updated));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  // Deleting a real task is permanent and there's no "creator" tracked to
  // grant an exception for (the earliest task_activity 'created' row isn't
  // reliable for tasks made before that feature shipped) — manager+ only,
  // same tier as every other permanent delete in the app (projects, sections,
  // workspaces). A sub-task is different: it's a lightweight checklist item
  // ("a title and a checkbox", per the Guides) that lives and dies with
  // whoever's working the parent task, so removing one stays open to anyone
  // non-viewer, same as toggling or renaming it.
  if (!existing.parent_task_id && !atLeast(req.workspaceRole, 'manager')) {
    return res.status(403).json({ error: 'Only a manager, admin, or owner can delete a task' });
  }
  // Attachment rows cascade via FK (for this task AND any sub-tasks, which
  // also cascade-delete), but the files on disk don't — clean those up first.
  const files = db.prepare(
    `SELECT filename FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE id = ? OR parent_task_id = ?)`
  ).all(id, id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  for (const f of files) fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {});
  res.json({ ok: true });
});

// --- activity: a task's timeline (system-logged changes + human comments),
// oldest first so it reads top-to-bottom like a conversation.

function requireTask(req, res) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(Number(req.params.id), req.workspaceId);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return null; }
  return task;
}

router.get('/:id/activity', (req, res) => {
  const task = requireTask(req, res);
  if (!task) return;
  const rows = db.prepare(
    `SELECT a.id, a.type, a.body, a.meta, a.created_at, u.id as user_id, u.name as user_name
     FROM task_activity a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.created_at ASC, a.id ASC`
  ).all(task.id);
  res.json(rows.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })));
});

router.post('/:id/comments', (req, res) => {
  const task = requireTask(req, res);
  if (!task) return;
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'A comment needs some text' });
  const info = db.prepare('INSERT INTO task_activity (task_id, user_id, type, body) VALUES (?, ?, ?, ?)').run(task.id, req.user.id, 'comment', body);
  const row = db.prepare(
    `SELECT a.id, a.type, a.body, a.meta, a.created_at, u.id as user_id, u.name as user_name
     FROM task_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`
  ).get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:id/activity/:activityId', (req, res) => {
  const task = requireTask(req, res);
  if (!task) return;
  const entry = db.prepare('SELECT * FROM task_activity WHERE id = ? AND task_id = ?').get(Number(req.params.activityId), task.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.type !== 'comment') return res.status(400).json({ error: "Only comments can be deleted — system history can't be edited" });
  if (entry.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own comments' });
  db.prepare('DELETE FROM task_activity WHERE id = ?').run(entry.id);
  res.json({ ok: true });
});

export default router;
