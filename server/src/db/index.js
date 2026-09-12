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
function hasTable(table) {
  return !!db.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', table);
}

// `assignees`/`task_assignees` (free-text task tagging) were replaced by
// `task_members` (real-account assignment, see schema.sql) — no longer part
// of a fresh install's schema at all, so every migration that touches them
// below is guarded on the table still existing on this particular database.
if (hasTable('assignees') && !hasColumn('assignees', 'color')) {
  db.exec("ALTER TABLE assignees ADD COLUMN color TEXT DEFAULT '#6366f1'");
}
if (!hasColumn('projects', 'is_favorite')) {
  db.exec('ALTER TABLE projects ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('projects', 'sort_order')) {
  db.exec('ALTER TABLE projects ADD COLUMN sort_order REAL NOT NULL DEFAULT 0');
  // Stable initial order (previously implicit alphabetical) so nothing shuffles on first load.
  const rows = db.prepare('SELECT id FROM projects ORDER BY name COLLATE NOCASE').all();
  const update = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
  rows.forEach((r, idx) => update.run(idx, r.id));
}
if (!hasColumn('tasks', 'section_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL');
}
if (!hasColumn('tasks', 'parent_task_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE');
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

// 'assignees' no longer exists on a fresh install (see the task_members note
// above) — only rebuild it if this particular database still has it.
if (hasTable('assignees')) {
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
}

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

for (const table of ['labels', 'assignees']) {
  if (hasTable(table) && !hasColumn(table, 'sort_order')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN sort_order REAL NOT NULL DEFAULT 0`);
    // Give existing rows a stable initial order (previously implicit alphabetical)
    // instead of leaving them all at 0, so they don't visually shuffle on first load.
    const rows = db.prepare(`SELECT id FROM ${table} ORDER BY name COLLATE NOCASE`).all();
    const update = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
    rows.forEach((r, idx) => update.run(idx, r.id));
  }
}

// `assignees`/`task_assignees` are retired in favor of `task_members` (real-
// account assignment). Only ever drop them when they're actually empty —
// never silently discard real historical data just because the feature was
// replaced; a database that still has rows in either just keeps both tables
// around, unused, same "leave it rather than risk data loss" approach as the
// unused `users.team` column above.
if (hasTable('assignees') || hasTable('task_assignees')) {
  const assigneeRows = hasTable('assignees') ? db.prepare('SELECT COUNT(*) c FROM assignees').get().c : 0;
  const taskAssigneeRows = hasTable('task_assignees') ? db.prepare('SELECT COUNT(*) c FROM task_assignees').get().c : 0;
  if (assigneeRows === 0 && taskAssigneeRows === 0) {
    db.exec('DROP TABLE IF EXISTS task_assignees');
    db.exec('DROP TABLE IF EXISTS assignees');
  } else {
    console.warn(`Not dropping legacy assignees/task_assignees tables — ${assigneeRows} assignee(s), ${taskAssigneeRows} task_assignee row(s) still present. Safe to ignore; they're just unused now.`);
  }
}
if (hasTable('assignees')) {
  db.exec('CREATE INDEX IF NOT EXISTS idx_assignees_workspace ON assignees(workspace_id)');
}

// --- multi-organization support (added after the initial single-tenant release) ---
if (!hasColumn('users', 'organization_id')) {
  db.exec('ALTER TABLE users ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
}
// `users.team` (free-text) was replaced by `domain_id` and no route has read
// or written it since — drop it if a pre-2026-09 database still has it.
// Confirmed empty on every row in production before this migration shipped;
// a fresh install never gets the column at all (see schema.sql).
if (hasColumn('users', 'team')) {
  db.exec('ALTER TABLE users DROP COLUMN team');
}
if (!hasColumn('users', 'domain_id')) {
  db.exec('ALTER TABLE users ADD COLUMN domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL');
}
if (!hasColumn('users', 'weekly_capacity_hours')) {
  db.exec('ALTER TABLE users ADD COLUMN weekly_capacity_hours INTEGER');
}
if (!hasColumn('invites', 'project_id')) {
  db.exec('ALTER TABLE invites ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE');
}
if (!hasColumn('workspaces', 'organization_id')) {
  db.exec('ALTER TABLE workspaces ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_workspaces_organization ON workspaces(organization_id)');

// One-time backfill for a database that predates organizations: everything
// in it belonged to a single implicit org, so give it a real one and carry
// its users/workspaces over — and translate the old two-tier role vocabulary
// ('admin' | 'member') to the new five-tier one ('owner' | 'admin' |
// 'manager' | 'developer' | 'viewer'): the old site admin becomes the org's
// owner, everyone else becomes a 'developer'.
const orphanUserCount = db.prepare('SELECT COUNT(*) c FROM users WHERE organization_id IS NULL').get().c;
const orphanWorkspaceCount = db.prepare('SELECT COUNT(*) c FROM workspaces WHERE organization_id IS NULL').get().c;
if (orphanUserCount > 0 || orphanWorkspaceCount > 0) {
  db.transaction(() => {
    let defaultOrg = db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get();
    if (!defaultOrg) {
      const info = db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run('My Organization', 'default');
      defaultOrg = { id: info.lastInsertRowid };
    }
    db.prepare('UPDATE users SET organization_id = ? WHERE organization_id IS NULL').run(defaultOrg.id);
    db.prepare('UPDATE workspaces SET organization_id = ? WHERE organization_id IS NULL').run(defaultOrg.id);
    db.prepare("UPDATE users SET role = 'owner' WHERE role = 'admin'").run();
    db.prepare("UPDATE users SET role = 'developer' WHERE role = 'member'").run();
    db.prepare("UPDATE workspace_members SET role = 'developer' WHERE role = 'member'").run();
    db.prepare("UPDATE invites SET role = 'developer' WHERE role = 'member' AND status = 'pending'").run();
  })();
}

// Now that every table definitely has workspace_id (and correct FK text),
// it's safe to index it and turn foreign key enforcement back on.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_labels_workspace ON labels(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_statuses_workspace ON statuses(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_priorities_workspace ON priorities(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
  CREATE INDEX IF NOT EXISTS idx_users_domain ON users(domain_id);
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

// --- seed the admin account from env. This runs on every boot, not just
// the very first one — e.g. if ADMIN_EMAIL is later changed to a different
// address, that new admin account gets created here too. This account is
// the *owner* of its own organization (creating one if none exists yet),
// same as anyone who self-registers an org — it's just provisioned from
// env instead of through the Register screen.
//
// Deliberately does NOT create or join any workspace on the admin's behalf
// (there is no "predefined workspace" — an owner with zero workspaces is a
// normal, supported state; see App.jsx's create-workspace prompt). Org
// owners reach every workspace in their org regardless via the Admin
// screen, and can create a fresh one from the sidebar whenever needed.
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const adminName = process.env.ADMIN_NAME || 'Admin';

if (adminEmail && adminPasswordHash) {
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
  if (!admin) {
    let org = db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get();
    if (!org) {
      const info = db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run('My Organization', 'default');
      org = { id: info.lastInsertRowid };
    }
    db.prepare(
      'INSERT INTO users (organization_id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(org.id, adminEmail, adminName, adminPasswordHash, 'owner');
  } else if (admin.role !== 'owner') {
    // Env is the source of truth for who this org's owner is.
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('owner', admin.id);
  }
}

export default db;
