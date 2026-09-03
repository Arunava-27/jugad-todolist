// One-time import: reads scripts/notion-export.json (a snapshot pulled from the
// Notion "⚙️ Dev Tasks" + "📁 Projects" databases) and seeds the SQLite DB.
// Safe to re-run: matches existing rows by notion_url and updates them instead
// of creating duplicates.
//
// Usage:  node scripts/import-notion.js   (or  npm run import-notion  from server/)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const EXPORT_PATH = path.resolve(__dirname, 'notion-export.json');
const SCHEMA_PATH = path.resolve(__dirname, '../server/src/db/schema.sql');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));

function getOrCreateLabel(name) {
  const existing = db.prepare('SELECT * FROM labels WHERE name = ?').get(name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO labels (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid);
}

function getOrCreateAssignee(name) {
  const existing = db.prepare('SELECT * FROM assignees WHERE name = ?').get(name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO assignees (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM assignees WHERE id = ?').get(info.lastInsertRowid);
}

const upsertProject = db.transaction((p) => {
  const existing = db.prepare('SELECT * FROM projects WHERE notion_url = ?').get(p.notion_url);
  if (existing) {
    db.prepare(
      `UPDATE projects SET name=?, status=?, platform=?, description=?, version=?, build_number=?,
        start_date=?, target_date=? WHERE id=?`
    ).run(p.name, p.status, p.platform, p.description, p.version, p.build_number, p.start_date, p.target_date, existing.id);
    return existing.id;
  }
  const info = db.prepare(
    `INSERT INTO projects (notion_url, name, status, platform, description, version, build_number, start_date, target_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.notion_url, p.name, p.status, p.platform, p.description, p.version, p.build_number, p.start_date, p.target_date);
  return info.lastInsertRowid;
});

const upsertTask = db.transaction((t, projectIdByUrl) => {
  const projectId = t.project_url ? projectIdByUrl.get(t.project_url) || null : null;
  const isCompleted = t.status === 'Done' ? 1 : 0;

  const existing = db.prepare('SELECT * FROM tasks WHERE notion_url = ?').get(t.notion_url);
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
      `INSERT INTO tasks (project_id, notion_url, notion_task_number, title, status, priority, platform,
         due_date, estimate_hours, version, build_number, link, is_completed, completed_at,
         sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      projectId, t.notion_url, t.task_number, t.title, t.status, t.priority, t.platform,
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
  projects: db.prepare('SELECT COUNT(*) c FROM projects').get().c,
  tasks: db.prepare('SELECT COUNT(*) c FROM tasks').get().c,
  labels: db.prepare('SELECT COUNT(*) c FROM labels').get().c,
  assignees: db.prepare('SELECT COUNT(*) c FROM assignees').get().c,
  done: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status = 'Done'").get().c,
};

console.log(`Imported ${data.projects.length} projects and ${taskCount} tasks from ${EXPORT_PATH}`);
console.log('DB totals:', totals);
console.log(`SQLite file: ${path.join(DATA_DIR, 'app.db')}`);
