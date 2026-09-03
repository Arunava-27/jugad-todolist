import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load repo-root .env (if present — e.g. in Docker, env vars come from
// docker-compose instead and no .env file exists, which dotenv treats as a
// harmless no-op). This runs here rather than in index.js so it's picked up
// by every entry point that touches the DB (the server, scripts/import-notion.js).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// Foreign key enforcement is turned on only after all migrations below have
// run — some of them rebuild tables (drop + recreate), which SQLite refuses
// mid-migration if enforcement is already on and child rows still exist.
db.pragma('foreign_keys = OFF');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- migrations for tables/columns added after the initial release ---
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

if (!hasColumn('assignees', 'color')) {
  db.exec("ALTER TABLE assignees ADD COLUMN color TEXT DEFAULT '#6366f1'");
}

// Simple additive columns: safe as a plain ALTER (nullable, backfilled below).
for (const table of ['projects', 'tasks']) {
  if (!hasColumn(table, 'workspace_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE`);
  }
}

// Tables whose uniqueness constraint changed from UNIQUE(name) to
// UNIQUE(workspace_id, name) need a rebuild — SQLite can't alter constraints
// in place. IMPORTANT: this creates the replacement under a temporary name
// and renames *that* into place, rather than renaming the original table out
// of the way — renaming a table SQLite still has other tables' foreign keys
// pointing at automatically rewrites those FK definitions to the new name,
// which would leave them dangling once the temp table is dropped.
function rebuildWithWorkspaceScope(table, createSql, copyColumns) {
  if (hasColumn(table, 'workspace_id')) return;
  const tmp = `${table}__migrating`;
  db.exec(createSql.replace(new RegExp(`CREATE TABLE ${table}\\b`), `CREATE TABLE ${tmp}`));
  db.exec(`INSERT INTO ${tmp} (${copyColumns}) SELECT ${copyColumns} FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
}

rebuildWithWorkspaceScope(
  'labels',
  `CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    UNIQUE (workspace_id, name)
  )`,
  'id, name, color'
);

rebuildWithWorkspaceScope(
  'assignees',
  `CREATE TABLE assignees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    UNIQUE (workspace_id, name)
  )`,
  'id, name, color'
);

rebuildWithWorkspaceScope(
  'statuses',
  `CREATE TABLE statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    sort_order REAL NOT NULL DEFAULT 0,
    is_done INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    UNIQUE (workspace_id, name)
  )`,
  'id, name, color, sort_order, is_done, is_default'
);

rebuildWithWorkspaceScope(
  'priorities',
  `CREATE TABLE priorities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    sort_order REAL NOT NULL DEFAULT 0,
    UNIQUE (workspace_id, name)
  )`,
  'id, name, color, sort_order'
);

// One-time repair for databases that already went through an earlier, buggy
// version of the migration above (which used to rename tables out of the way
// first — SQLite then auto-rewrote task_labels/task_assignees' FK clauses to
// point at the now-dropped "_old" table). Rebuilding these two join tables
// re-points their FK text at the real, current labels/assignees tables
// without touching any data (the row values were never wrong, only the
// stored constraint text was).
for (const [table, refTable] of [['task_labels', 'labels'], ['task_assignees', 'assignees']]) {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(table);
  if (row && /_old/.test(row.sql)) {
    const tmp = `${table}__migrating`;
    const otherCol = table === 'task_labels' ? 'label_id' : 'assignee_id';
    db.exec(`CREATE TABLE ${tmp} (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      ${otherCol} INTEGER NOT NULL REFERENCES ${refTable}(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, ${otherCol})
    )`);
    db.exec(`INSERT INTO ${tmp} (task_id, ${otherCol}) SELECT task_id, ${otherCol} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
  }
}

// Now that every table definitely has workspace_id (and correct FK text),
// it's safe to index it and turn foreign key enforcement back on.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_labels_workspace ON labels(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_assignees_workspace ON assignees(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_statuses_workspace ON statuses(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_priorities_workspace ON priorities(workspace_id);
`);
db.pragma('foreign_keys = ON');

export function seedDefaultWorkflow(workspaceId) {
  const insertStatus = db.prepare(
    'INSERT INTO statuses (workspace_id, name, color, sort_order, is_done, is_default) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const seedStatuses = db.transaction(() => {
    insertStatus.run(workspaceId, 'Not started', '#94a3b8', 0, 0, 1);
    insertStatus.run(workspaceId, 'In progress', '#6366f1', 1, 0, 0);
    insertStatus.run(workspaceId, 'Done', '#22c55e', 2, 1, 0);
  });
  seedStatuses();

  const insertPriority = db.prepare('INSERT INTO priorities (workspace_id, name, color, sort_order) VALUES (?, ?, ?, ?)');
  const seedPriorities = db.transaction(() => {
    insertPriority.run(workspaceId, '🔴 P1 - Urgent', '#e53e3e', 0);
    insertPriority.run(workspaceId, '🟠 P2 - High', '#f0993d', 1);
    insertPriority.run(workspaceId, '🟡 P3 - Medium', '#e2c53d', 2);
    insertPriority.run(workspaceId, '🟢 P4 - Low', '#3fae5f', 3);
    insertPriority.run(workspaceId, '⚪ P5 - Optional', '#a0aec0', 4);
  });
  seedPriorities();
}

// --- seed the admin account from env, and make sure they always land
// somewhere: either the existing workspace(s) if any already exist, or a
// fresh bootstrap workspace (which also absorbs any pre-workspace data) if
// none do yet. This runs on every boot, not just the very first one — e.g.
// if ADMIN_EMAIL is later changed to a different address, that new admin
// account gets created here too, and must not end up with zero workspace
// memberships (the frontend has nowhere to send a user with none).
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const adminName = process.env.ADMIN_NAME || 'Admin';

if (adminEmail && adminPasswordHash) {
  let admin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
  if (!admin) {
    const info = db.prepare(
      'INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(adminEmail, adminName, adminPasswordHash, 'admin');
    admin = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else if (admin.role !== 'admin') {
    // Env is the source of truth for who the admin is.
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', admin.id);
  }

  const hasMembership = db.prepare('SELECT 1 FROM workspace_members WHERE user_id = ?').get(admin.id);
  if (!hasMembership) {
    const anyWorkspace = db.prepare('SELECT id FROM workspaces ORDER BY id LIMIT 1').get();
    if (anyWorkspace) {
      // Workspace(s) already exist (created by a previous admin, or by users
      // registering) — join the oldest one as owner rather than creating a
      // duplicate. Admins can already reach every workspace via the Admin
      // screen regardless; this just gives them a sane default landing spot.
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(anyWorkspace.id, admin.id, 'owner');
    } else {
      const info = db.prepare('INSERT INTO workspaces (name, created_by) VALUES (?, ?)')
        .run(process.env.DEFAULT_WORKSPACE_NAME || 'Default Workspace', admin.id);
      const workspaceId = info.lastInsertRowid;
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, admin.id, 'owner');

      // Backfill any rows left over from before workspaces existed (fresh
      // installs have nothing to backfill here, this is a no-op).
      for (const table of ['projects', 'tasks', 'labels', 'assignees', 'statuses', 'priorities']) {
        db.prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL`).run(workspaceId);
      }

      const statusCount = db.prepare('SELECT COUNT(*) c FROM statuses WHERE workspace_id = ?').get(workspaceId).c;
      if (statusCount === 0) seedDefaultWorkflow(workspaceId);
    }
  }
}

export default db;
