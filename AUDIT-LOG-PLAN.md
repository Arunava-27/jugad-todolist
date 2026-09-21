# Organization Audit Log Plan

## Goal

Extend the existing per-secret audit pattern (`project_secret_access_log`, see `secrets.js`) to an
org-wide event log: a single admin-visible feed of who did what across the organization, for security
review and "who changed this" questions that today have no answer outside the git history of the data
itself.

## Product decisions

### Scope for the first release

Event categories, matching `PRODUCT-READINESS-ROADMAP.md`'s "Organization audit log" section:

1. Organization settings changes (rename).
2. User lifecycle: created (invite accepted), deactivated/reactivated, deleted, role changed.
3. Workspace membership: member added/removed, role changed within a workspace; invite created/revoked.
4. Workspace/project lifecycle: created, deleted. (No archive state exists yet for either — skip until
   one does.)
5. Secret sharing/access: reuse the events `secrets.js` already logs to `project_secret_access_log`;
   fan the same calls out to the org log too, rather than duplicating that table's schema or its
   per-secret access-log endpoint.

Deferred: integration installation/link/disconnect events — there's no integration to emit them yet
(Milestone C, not built). Add the calls when `GITHUB-INTEGRATION-PLAN.md` lands, not before.

Visibility: admin+ only (org `role`), same gate as the rest of `/api/admin`. Not visible to the person
being audited, consistent with the per-secret log's own reasoning.

### Deferred scope

- Filtering/exporting beyond basic pagination and an action-type filter.
- Retention/rotation policy (revisit once real volume is known).
- Alerting on specific event types (e.g. role escalation) — a v2 feature once the feed itself exists.

## Schema

New table, modeled directly on `project_secret_access_log`:

```sql
CREATE TABLE IF NOT EXISTS org_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,       -- e.g. 'user.role_changed', 'workspace.created', 'secret.shared'
  target_type TEXT NOT NULL,  -- 'organization' | 'user' | 'workspace' | 'project' | 'invite' | 'secret'
  target_id INTEGER,          -- nullable: the target may since have been deleted
  target_label TEXT,          -- snapshot of a human-readable name at the time, same reasoning as secret_label
  meta TEXT,                  -- JSON: safe, non-secret before/after fields only (see Redaction)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_org_audit_log_org ON org_audit_log(organization_id, created_at DESC);
```

No FK to a specific target table (target can be any of five types) — `target_type` + `target_id` is a
loose reference, same trade-off `task_activity.meta` already makes for polymorphic detail.

### Redaction

`meta` must never contain: password hashes, raw tokens, secret values/file contents, or full third-party
payloads. Enforced by convention at each call site (pass only the specific fields named in the
instrumentation list below) — no automatic scrubber, since every call site already knows exactly what
it's logging.

## Instrumentation

One helper, `server/src/lib/auditLog.js`:

```js
export function logOrgEvent({ organizationId, actorId, action, targetType, targetId, targetLabel, meta }) {
  db.prepare(
    `INSERT INTO org_audit_log (organization_id, actor_id, action, target_type, target_id, target_label, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(organizationId, actorId, action, targetType, targetId ?? null, targetLabel ?? null, meta ? JSON.stringify(meta) : null);
}
```

Call sites to add (all already-existing mutation routes — no new endpoints needed to produce events):

| File | Route | action | meta |
|---|---|---|---|
| `admin.js` | `PATCH /organization` | `organization.renamed` | `{ from, to }` |
| `admin.js` | `PATCH /users/:id` (role) | `user.role_changed` | `{ from, to }` |
| `admin.js` | `PATCH /users/:id` (is_active) | `user.deactivated` / `user.reactivated` | — |
| `admin.js` | `DELETE /users/:id` | `user.deleted` | `{ name, email }` |
| `invites.js` | `POST /:token/accept` | `user.created` (only when accept creates a new account) | `{ email }` |
| `workspaces.js` | `POST /` | `workspace.created` | `{ name }` |
| `workspaces.js` | `DELETE /:id` | `workspace.deleted` | `{ name }` |
| `workspaces.js` | `POST /:id/members` | `workspace.member_added` / `invite.created` | `{ email, role }` |
| `workspaces.js` | `PATCH /:id/members/:userId` | `workspace.member_role_changed` | `{ from, to }` |
| `workspaces.js` | `DELETE /:id/members/:userId` | `workspace.member_removed` | `{ email }` |
| `workspaces.js` | `DELETE /:id/invites/:inviteId` | `invite.revoked` | `{ email }` |
| `projects.js` | `POST /` | `project.created` | `{ name }` |
| `projects.js` | `DELETE /:id` | `project.deleted` | `{ name }` |
| `secrets.js` | wherever `logAccess(...)` is already called | `secret.<action>` (reuse the same `action` value) | `{ label }` |

`organizationId` comes from `req.user.organization_id` (or the workspace's, for workspace/project
routes — same resolution `roleFor` already does); `actorId` from `req.user.id`.

## API

`GET /api/admin/audit-log` — admin+ only (already covered by the router-level `requireAdmin` on
`/api/admin`, same as every other admin.js route).

Query params: `action` (exact match), `target_type`, `limit`/`offset` (default 50/0, matches other
paginated admin lists' scale). Returns rows joined with `users` for `actor_name`, newest first —
same shape as the existing `GET /:id/access-log` in `secrets.js`.

## UI

Add an "Audit Log" tab to `web/src/pages/Admin.jsx`, alongside Users/Workspaces/Domains/Organization
(`Admin.jsx:133-136`). Simple table: timestamp, actor, action, target, expandable meta — same list-based
layout the other tabs already use, no new component library.

## Effort estimate

Small: one migration, one ~15-line helper, ~13 one-line call-site additions, one GET route, one new tab
reusing existing table markup. No new dependencies.
