-- Punchlist schema

-- A tenant. Whoever registers without an invite founds one of these and
-- becomes its 'owner'; everyone else in it either founded it or was invited
-- in by someone already inside it. Workspaces and users each belong to
-- exactly one organization — there's no cross-org visibility anywhere.
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A structured domain/discipline within an organization (Frontend, Backend,
-- QA, DevOps, Design, PM, ...) — the owner defines the list; every user
-- optionally carries one. Purely descriptive/filterable, no permissions of
-- its own (permissions are entirely `users.role`/`workspace_members.role`).
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer', -- rank within their org: 'owner' | 'admin' | 'manager' | 'developer' | 'viewer'
  domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL, -- their discipline (see `domains`); replaces the
    -- old free-text `team` column, dropped (2026-09) by the migration in db/index.js after confirming no
    -- production row still carried a real value in it — a fresh install never has the column at all.
  is_active INTEGER NOT NULL DEFAULT 1,
  weekly_capacity_hours INTEGER, -- for the Dashboard's capacity view; NULL means "use the default" (see overview.js)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer', -- 'owner' | 'admin' | 'manager' | 'developer' | 'viewer' (within this workspace)
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, user_id)
);

-- A pending email invitation to join a workspace, for an address that may
-- or may not have a Punchlist account yet. Resolved by token (mailed as a
-- link) rather than by id, so it can't be enumerated/guessed.
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- set only for a stakeholder invite (see below); NULL for a normal workspace-join invite
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer', -- workspace role granted on acceptance; never 'owner'. Meaningless for a stakeholder invite (project_id set) — accepting one of those grants project_stakeholders access instead of workspace_members
  token TEXT NOT NULL UNIQUE,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'revoked'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  notion_url TEXT,
  name TEXT NOT NULL,
  status TEXT, -- the project's lifecycle stage: 'Planning' | 'Active' | 'On Hold' | 'Testing' | 'Launched' (see web/src/lib/projectStages.js) — independent of `is_archived`, which is purely a sidebar-visibility toggle
  platform TEXT,
  description TEXT,
  version TEXT,
  build_number TEXT,
  start_date TEXT,
  target_date TEXT,
  color TEXT DEFAULT '#6366f1',
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Grants a user read-only, high-level visibility into ONE project — status,
-- progress, dates, description — without full task detail, and without
-- needing a `workspace_members` row at all. This is how an external or
-- non-technical stakeholder reaches a project: scoped to specific projects
-- they care about, not the whole workspace. See server/src/routes/projectSummary.js.
CREATE TABLE IF NOT EXISTS project_stakeholders (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, user_id)
);

-- Named groupings of tasks within a project's List view (e.g. "Backlog",
-- "In Review") — independent of a task's status/board column.
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
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
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS task_labels (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Task assignment to a real account (a member of the task's workspace) —
-- replaces the old free-text `assignees`/`task_assignees` tables (2026-09;
-- those are dropped by a migration in db/index.js if empty), so assignment
-- is always a real, permissioned person rather than a decorative name tag.
CREATE TABLE IF NOT EXISTS task_members (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- Customizable workflow: the exact set of statuses/priorities is user-editable
-- (rename, recolor, reorder, add, remove) via Settings, per workspace.
CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  sort_order REAL NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,       -- server-generated name the file is stored under in data/uploads
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A task's timeline: human comments and system-logged changes interleaved,
-- oldest first. `type = 'comment'` uses `body`; every other type is a
-- system event logged by the server itself (never client-supplied) with
-- structured details in `meta` (JSON, e.g. {"from":"Not started","to":"Done"})
-- and `body` left NULL. See tasks.js's logActivity().
CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- 'comment' | 'created' | 'status' | 'priority' | 'due_date' | 'assignee_added' | 'assignee_removed' | 'completed' | 'reopened'
  body TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_workspace ON invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id);
CREATE INDEX IF NOT EXISTS idx_domains_organization ON domains(organization_id);
-- NOTE: idx_users_domain is created in db/index.js instead — users.domain_id
-- is added by a migration on a pre-existing database, same reasoning as the
-- workspace_id-dependent indexes described below.
CREATE INDEX IF NOT EXISTS idx_task_members_user ON task_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_user ON project_stakeholders(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);

-- NOTE: indexes on the workspace_id column of projects/tasks/labels/assignees/
-- statuses/priorities are created in db/index.js, AFTER the migrations that
-- add that column to pre-existing (pre-workspace) databases — creating them
-- here would fail on such a database, since the column doesn't exist until
-- those migrations run.
