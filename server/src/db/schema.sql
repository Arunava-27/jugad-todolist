-- Jugad Todolist schema

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_url TEXT,
  name TEXT NOT NULL,
  status TEXT,
  platform TEXT,
  description TEXT,
  version TEXT,
  build_number TEXT,
  start_date TEXT,
  target_date TEXT,
  color TEXT DEFAULT '#6366f1',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  notion_url TEXT,
  notion_task_number INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Not started',
  priority TEXT,
  platform TEXT,
  due_date TEXT,
  estimate_hours REAL,
  version TEXT,
  build_number TEXT,
  link TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#94a3b8'
);

CREATE TABLE IF NOT EXISTS task_labels (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_id INTEGER NOT NULL REFERENCES assignees(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, assignee_id)
);

-- Customizable workflow: the exact set of statuses/priorities is user-editable
-- (rename, recolor, reorder, add, remove) via Settings, instead of a fixed list.
CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
