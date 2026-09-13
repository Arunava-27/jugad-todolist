// The Claude connector: an MCP (Model Context Protocol) server exposing a
// deliberately small set of tools, all of them bound to ONE authenticated
// person (whoever the request's PAT belongs to — see server/src/index.js's
// /mcp route). Every tool re-checks that person's real role in the
// workspace via roleFor()/atLeast(), the exact same helpers every REST
// route uses — a tool never has more reach than that person already has in
// the app itself. Assigning/unassigning *someone else*, deleting a task,
// and managing projects/teams/secrets are deliberately NOT exposed here —
// "resolve conflicts" means log a blocker or comment, never silently
// override someone else's task. See the roadmap plan's Phase 8 section for
// the full reasoning.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import db from '../db/index.js';
import { roleFor } from '../lib/permissions.js';
import { hydrateTask, logActivity, isDoneStatus } from '../routes/tasks.js';

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}
function errorResult(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// Mirrors requireWorkspace's rules exactly (member required; viewer is
// read-only) — tools have no Express middleware chain to sit behind, so
// each one that takes a workspace_id checks this itself, first thing.
function checkWorkspaceAccess(user, workspaceId, { write = false } = {}) {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) return { error: 'Workspace not found' };
  const role = roleFor(user, workspaceId);
  if (!role) return { error: 'Not a member of this workspace' };
  if (write && role === 'viewer') return { error: 'Viewers have read-only access to this workspace' };
  return { role };
}

function requireTask(workspaceId, taskId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(taskId, workspaceId);
}

export function createMcpServer(user) {
  const server = new McpServer(
    { name: 'punchlist', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        `You are acting as ${user.name} (${user.email}) on Punchlist, a team task tracker — through this ` +
        `person's own role and permissions, nothing more. Start with list_workspaces to get a workspace_id, ` +
        `every other tool needs one. You can see and work your own assigned tasks, update their status, ` +
        `comment, and log a blocker — you cannot reassign a task to someone else, delete a task, or change ` +
        `anyone else's work. If something looks like it needs another person's attention or looks like a ` +
        `scheduling conflict, log a blocker or leave a comment explaining it rather than acting on their behalf.`,
    }
  );

  server.registerTool(
    'list_workspaces',
    {
      title: 'List workspaces',
      description: "List every workspace the current person belongs to. Call this first — every other tool needs a workspace_id from here.",
    },
    async () => {
      const rows = db.prepare(
        `SELECT w.id, w.name, wm.role as my_role
         FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE wm.user_id = ? ORDER BY w.name COLLATE NOCASE`
      ).all(user.id);
      // An org owner has blanket access to every workspace in their org even
      // without a workspace_members row (roleFor()'s own rule) — include
      // those too, or this would undercount for an owner-held token.
      if (user.role === 'owner') {
        const known = new Set(rows.map((r) => r.id));
        const orgWorkspaces = db.prepare('SELECT id, name FROM workspaces WHERE organization_id = ?').all(user.organization_id);
        for (const w of orgWorkspaces) if (!known.has(w.id)) rows.push({ ...w, my_role: 'owner' });
      }
      return textResult(rows);
    }
  );

  server.registerTool(
    'list_my_tasks',
    {
      title: 'List my tasks',
      description: "List the current person's own tasks in one workspace — open by default. Narrow by project, status, or a due-by date.",
      inputSchema: {
        workspace_id: z.number().int().describe('From list_workspaces'),
        project_id: z.number().int().optional(),
        status: z.string().optional().describe('An exact status name in this workspace, e.g. "In progress"'),
        due_before: z.string().optional().describe('ISO date (YYYY-MM-DD) — only tasks due on or before this date'),
        include_completed: z.boolean().optional().describe('Default false — set true to also see finished tasks'),
      },
    },
    async ({ workspace_id, project_id, status, due_before, include_completed }) => {
      const access = checkWorkspaceAccess(user, workspace_id);
      if (access.error) return errorResult(access.error);

      const where = ['t.workspace_id = ?', 'tm.user_id = ?', 't.parent_task_id IS NULL'];
      const params = [workspace_id, user.id];
      if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
      if (status) { where.push('t.status = ?'); params.push(status); }
      if (due_before) { where.push('t.due_date IS NOT NULL AND t.due_date <= ?'); params.push(due_before); }
      if (!include_completed) where.push('t.is_completed = 0');

      const rows = db.prepare(
        `SELECT DISTINCT t.* FROM tasks t JOIN task_members tm ON tm.task_id = t.id
         WHERE ${where.join(' AND ')}
         ORDER BY (t.due_date IS NULL), t.due_date ASC, t.sort_order ASC`
      ).all(...params);
      return textResult(rows.map(hydrateTask));
    }
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description: "Fetch one task's full detail — description, status, labels, assignees, due date, sub-task progress, attachment list.",
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int() },
    },
    async ({ workspace_id, task_id }) => {
      const access = checkWorkspaceAccess(user, workspace_id);
      if (access.error) return errorResult(access.error);
      const task = requireTask(workspace_id, task_id);
      if (!task) return errorResult('Task not found in this workspace');
      return textResult(hydrateTask(task));
    }
  );

  server.registerTool(
    'update_task_status',
    {
      title: 'Update task status',
      description: "Change a task's status (e.g. to mark it in progress or done) — get_task or list_my_tasks show the current value; status names are workspace-specific and customizable, so check one first if unsure.",
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int(), status: z.string() },
    },
    async ({ workspace_id, task_id, status }) => {
      const access = checkWorkspaceAccess(user, workspace_id, { write: true });
      if (access.error) return errorResult(access.error);
      const existing = requireTask(workspace_id, task_id);
      if (!existing) return errorResult('Task not found in this workspace');
      const validStatus = db.prepare('SELECT 1 FROM statuses WHERE workspace_id = ? AND name = ?').get(workspace_id, status);
      if (!validStatus) return errorResult(`"${status}" isn't one of this workspace's statuses`);

      const done = isDoneStatus(workspace_id, status);
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET status = ?, is_completed = ?, completed_at = ?, updated_at = ? WHERE id = ?')
        .run(status, done ? 1 : 0, done ? now : null, now, task_id);

      if (status !== existing.status) logActivity(task_id, user.id, 'status', { from: existing.status, to: status });
      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
      if (!!updated.is_completed !== !!existing.is_completed) {
        logActivity(task_id, user.id, updated.is_completed ? 'completed' : 'reopened');
      }
      return textResult(hydrateTask(updated));
    }
  );

  server.registerTool(
    'self_assign_task',
    {
      title: 'Assign this task to me',
      description: "Add the current person as an assignee on a task. Always allowed on yourself, regardless of role — this can never assign someone else's task to you or add another person.",
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int() },
    },
    async ({ workspace_id, task_id }) => {
      const access = checkWorkspaceAccess(user, workspace_id, { write: true });
      if (access.error) return errorResult(access.error);
      const task = requireTask(workspace_id, task_id);
      if (!task) return errorResult('Task not found in this workspace');
      const already = db.prepare('SELECT 1 FROM task_members WHERE task_id = ? AND user_id = ?').get(task_id, user.id);
      if (!already) {
        db.prepare('INSERT INTO task_members (task_id, user_id) VALUES (?, ?)').run(task_id, user.id);
        logActivity(task_id, user.id, 'assignee_added', { name: user.name });
      }
      return textResult(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id)));
    }
  );

  server.registerTool(
    'self_unassign_task',
    {
      title: 'Remove me from this task',
      description: 'Remove the current person as an assignee on a task. Always allowed on yourself — this cannot remove another assignee.',
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int() },
    },
    async ({ workspace_id, task_id }) => {
      const access = checkWorkspaceAccess(user, workspace_id, { write: true });
      if (access.error) return errorResult(access.error);
      const task = requireTask(workspace_id, task_id);
      if (!task) return errorResult('Task not found in this workspace');
      const wasAssigned = db.prepare('SELECT 1 FROM task_members WHERE task_id = ? AND user_id = ?').get(task_id, user.id);
      if (wasAssigned) {
        db.prepare('DELETE FROM task_members WHERE task_id = ? AND user_id = ?').run(task_id, user.id);
        logActivity(task_id, user.id, 'assignee_removed', { name: user.name });
      }
      return textResult(hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id)));
    }
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add a comment',
      description: "Post a comment on a task's activity timeline, visible to everyone with access to the task.",
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int(), body: z.string().min(1) },
    },
    async ({ workspace_id, task_id, body }) => {
      const access = checkWorkspaceAccess(user, workspace_id, { write: true });
      if (access.error) return errorResult(access.error);
      const task = requireTask(workspace_id, task_id);
      if (!task) return errorResult('Task not found in this workspace');
      const info = db.prepare('INSERT INTO task_activity (task_id, user_id, type, body) VALUES (?, ?, ?, ?)')
        .run(task_id, user.id, 'comment', body.trim());
      return textResult({ id: info.lastInsertRowid, task_id, type: 'comment', body: body.trim() });
    }
  );

  server.registerTool(
    'log_blocker',
    {
      title: 'Log a blocker',
      description:
        "Flag that a task is blocked, with an explanation, on its activity timeline — the way to raise a conflict or " +
        "dependency on someone else's work. This only ever adds a visible, flagged note; it never reassigns, edits, " +
        "or overrides anyone else's task.",
      inputSchema: { workspace_id: z.number().int(), task_id: z.number().int(), body: z.string().min(1) },
    },
    async ({ workspace_id, task_id, body }) => {
      const access = checkWorkspaceAccess(user, workspace_id, { write: true });
      if (access.error) return errorResult(access.error);
      const task = requireTask(workspace_id, task_id);
      if (!task) return errorResult('Task not found in this workspace');
      const info = db.prepare('INSERT INTO task_activity (task_id, user_id, type, body) VALUES (?, ?, ?, ?)')
        .run(task_id, user.id, 'blocker', body.trim());
      return textResult({ id: info.lastInsertRowid, task_id, type: 'blocker', body: body.trim() });
    }
  );

  return server;
}
