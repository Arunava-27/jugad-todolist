import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- migrations for columns added after the initial release ---
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
if (!hasColumn('assignees', 'color')) {
  db.exec("ALTER TABLE assignees ADD COLUMN color TEXT DEFAULT '#6366f1'");
}

// --- seed default workflow (statuses/priorities) on first boot only ---
// Names match what the Notion import already wrote into tasks.status /
// tasks.priority, so existing imported data keeps working unchanged.
const statusCount = db.prepare('SELECT COUNT(*) c FROM statuses').get().c;
if (statusCount === 0) {
  const insert = db.prepare(
    'INSERT INTO statuses (name, color, sort_order, is_done, is_default) VALUES (?, ?, ?, ?, ?)'
  );
  const seed = db.transaction(() => {
    insert.run('Not started', '#94a3b8', 0, 0, 1);
    insert.run('In progress', '#6366f1', 1, 0, 0);
    insert.run('Ongoing', '#8b5cf6', 2, 0, 0);
    insert.run('Maintenance', '#eab308', 3, 0, 0);
    insert.run('Clarity from IEMRF', '#ec4899', 4, 0, 0);
    insert.run('Done', '#22c55e', 5, 1, 0);
  });
  seed();
}

const priorityCount = db.prepare('SELECT COUNT(*) c FROM priorities').get().c;
if (priorityCount === 0) {
  const insert = db.prepare('INSERT INTO priorities (name, color, sort_order) VALUES (?, ?, ?)');
  const seed = db.transaction(() => {
    insert.run('🔴 P1 - Urgent', '#e53e3e', 0);
    insert.run('🟠 P2 - High', '#f0993d', 1);
    insert.run('🟡 P3 - Medium', '#e2c53d', 2);
    insert.run('🟢 P4 - Low', '#3fae5f', 3);
    insert.run('⚪ P5 - Optional', '#a0aec0', 4);
  });
  seed();
}

export default db;
