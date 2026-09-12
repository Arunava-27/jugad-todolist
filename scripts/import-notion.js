// One-time import: reads scripts/notion-export.json (a snapshot pulled from the
// Notion "⚙️ Dev Tasks" + "📁 Projects" databases) and seeds it into the oldest
// existing workspace. Safe to re-run: matches existing rows by notion_url and
// updates them instead of creating duplicates.
//
// There's no predefined/default workspace — this script imports into whichever
// workspace already exists (oldest first), so create one first (via the app's
// own "create a workspace" screen, or the admin) before running this.
//
// Usage:  node scripts/import-notion.js   (or  npm run import-notion  from repo root)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../server/src/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_PATH = path.resolve(__dirname, 'notion-export.json');

const workspace = db.prepare('SELECT id, name FROM workspaces ORDER BY id LIMIT 1').get();
if (!workspace) {
  console.error(
    'No workspace found. Create one first — sign in and use the "create a workspace" screen, or ' +
    'have an admin create one — then re-run this import; it targets whichever workspace exists.'
  );
  process.exit(1);
}
const workspaceId = workspace.id;

const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));

function getOrCreateLabel(name) {
  const existing = db.prepare('SELECT * FROM labels WHERE workspace_id = ? AND name = ?').get(workspaceId, name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO labels (workspace_id, name) VALUES (?, ?)').run(workspaceId, name);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid);
}

// Notion's assignees are just names, not accounts — tasks are assigned to
// real accounts now (see task_members in schema.sql), so a name can only be
// imported if it matches an existing org member's display name exactly
// (case-insensitive). Anything that doesn't match is skipped and reported
// at the end rather than silently dropped, since there's no reliable way to
// invent an account from a bare name.
const unmatchedAssignees = new Set();
function resolveAssigneeUserId(name) {
  const match = db.prepare(
    `SELECT u.id FROM users u JOIN workspace_members wm ON wm.user_id = u.id
     WHERE wm.workspace_id = ? AND LOWER(u.name) = LOWER(?)`
  ).get(workspaceId, name);
  if (!match) { unmatchedAssignees.add(name); return null; }
  return match.id;
}

const upsertProject = db.transaction((p) => {
  const existing = db.prepare('SELECT * FROM projects WHERE workspace_id = ? AND notion_url = ?').get(workspaceId, p.notion_url);
  if (existing) {
    db.prepare(
      `UPDATE projects SET name=?, status=?, platform=?, description=?, version=?, build_number=?,
        start_date=?, target_date=? WHERE id=?`
    ).run(p.name, p.status, p.platform, p.description, p.version, p.build_number, p.start_date, p.target_date, existing.id);
    return existing.id;
  }
  const info = db.prepare(
    `INSERT INTO projects (workspace_id, notion_url, name, status, platform, description, version, build_number, start_date, target_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(workspaceId, p.notion_url, p.name, p.status, p.platform, p.description, p.version, p.build_number, p.start_date, p.target_date);
  return info.lastInsertRowid;
});

const upsertTask = db.transaction((t, projectIdByUrl) => {
  const projectId = t.project_url ? projectIdByUrl.get(t.project_url) || null : null;
  const isCompleted = t.status === 'Done' ? 1 : 0;

  const existing = db.prepare('SELECT * FROM tasks WHERE workspace_id = ? AND notion_url = ?').get(workspaceId, t.notion_url);
  let taskId;
  if (existing) {
    db.prepare(
      `UPDATE tasks SET project_id=?, notion_task_number=?, title=?, status=?, priority=?, platform=?,
        due_date=?, estimate_hours=?, version=?, build_number=?, link=?, is_completed=?,
        completed_at=?, created_at=?, updated_at=? WHERE id=?`
    ).run(
      projectId, t.task_number, t.title, t.status, t.priority, t.platform, t.due_date,
      t.estimate_hours, t.version, t.build_number, t.link, isCompleted,
      isCompleted ? t.created : null, t.created, new Date().toISOString(), existing.id
    );
    taskId = existing.id;
  } else {
    const info = db.prepare(
      `INSERT INTO tasks (workspace_id, project_id, notion_url, notion_task_number, title, status, priority, platform,
         due_date, estimate_hours, version, build_number, link, is_completed, completed_at,
         sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workspaceId, projectId, t.notion_url, t.task_number, t.title, t.status, t.priority, t.platform,
      t.due_date, t.estimate_hours, t.version, t.build_number, t.link, isCompleted,
      isCompleted ? t.created : null, t.task_number, t.created, t.created
    );
    taskId = info.lastInsertRowid;
  }

  db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(taskId);
  for (const name of t.tags || []) {
    const label = getOrCreateLabel(name);
    db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)').run(taskId, label.id);
  }

  db.prepare('DELETE FROM task_members WHERE task_id = ?').run(taskId);
  for (const name of t.assignees || []) {
    const userId = resolveAssigneeUserId(name);
    if (userId) db.prepare('INSERT OR IGNORE INTO task_members (task_id, user_id) VALUES (?, ?)').run(taskId, userId);
  }
});

const projectIdByUrl = new Map();
for (const p of data.projects) {
  const id = upsertProject(p);
  projectIdByUrl.set(p.notion_url, id);
}

let taskCount = 0;
for (const t of data.tasks) {
  upsertTask(t, projectIdByUrl);
  taskCount++;
}

const totals = {
  projects: db.prepare('SELECT COUNT(*) c FROM projects WHERE workspace_id = ?').get(workspaceId).c,
  tasks: db.prepare('SELECT COUNT(*) c FROM tasks WHERE workspace_id = ?').get(workspaceId).c,
  labels: db.prepare('SELECT COUNT(*) c FROM labels WHERE workspace_id = ?').get(workspaceId).c,
  done: db.prepare("SELECT COUNT(*) c FROM tasks WHERE workspace_id = ? AND status = 'Done'").get(workspaceId).c,
};

console.log(`Imported ${data.projects.length} projects and ${taskCount} tasks from ${EXPORT_PATH}`);
console.log(`Into workspace: "${workspace.name}" (id ${workspaceId})`);
console.log('DB totals:', totals);
if (unmatchedAssignees.size > 0) {
  console.log(
    `Note: these Notion assignee names didn't match a real account's display name in this workspace, ` +
    `so those tasks were imported unassigned — assign them by hand from the task modal: ` +
    [...unmatchedAssignees].join(', ')
  );
}
