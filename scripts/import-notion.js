// One-time import: reads scripts/notion-export.json (a snapshot pulled from the
// Notion "⚙️ Dev Tasks" + "📁 Projects" databases) and seeds it into the admin's
// workspace. Safe to re-run: matches existing rows by notion_url and updates
// them instead of creating duplicates.
//
// Requires ADMIN_EMAIL + ADMIN_PASSWORD_HASH to already be set in the
// environment (same as the server) — importing db/index.js runs the same
// admin + bootstrap-workspace seeding the server does on boot, and this
// script imports everything into that workspace.
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
    'No workspace found. Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD_HASH in the environment ' +
    '(same as running the server) before running this import — that seeds the admin account and ' +
    'its default workspace, which this script imports the Notion data into.'
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

function getOrCreateAssignee(name) {
  const existing = db.prepare('SELECT * FROM assignees WHERE workspace_id = ? AND name = ?').get(workspaceId, name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO assignees (workspace_id, name) VALUES (?, ?)').run(workspaceId, name);
  return db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid);
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

  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  for (const name of t.assignees || []) {
    const assignee = getOrCreateAssignee(name);
    db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, assignee_id) VALUES (?, ?)').run(taskId, assignee.id);
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
  assignees: db.prepare('SELECT COUNT(*) c FROM assignees WHERE workspace_id = ?').get(workspaceId).c,
  done: db.prepare("SELECT COUNT(*) c FROM tasks WHERE workspace_id = ? AND status = 'Done'").get(workspaceId).c,
};

console.log(`Imported ${data.projects.length} projects and ${taskCount} tasks from ${EXPORT_PATH}`);
console.log(`Into workspace: "${workspace.name}" (id ${workspaceId})`);
console.log('DB totals:', totals);
