# Messaging Plan (Direct Messages and Channels)

## Goal

Give a Punchlist workspace real-time-feeling internal messaging, separate from task comments:

- 1:1 direct messages between any two members of the same workspace;
- a workspace-wide "General" channel every member can see;
- a channel per project team (see `teams`/`team_members`), for the people actually assembled to work
  that project;
- unread counts and per-thread/per-channel read state.

This sits alongside the existing task-comment system (`task_activity`, `type = 'comment'`) rather than
replacing it — task comments stay task-scoped conversation; this is person-to-person and team-to-team
conversation that has nothing to do with a specific task.

## Product decisions

### Scope for the first release

1. 1:1 direct message threads between any two members of the same workspace.
2. One auto-created "General" channel per workspace, visible to every member including viewer role.
3. One auto-created channel per project team, visible to that team's members and to manager+ workspace-
   wide (so a manager overseeing a project sees every team's channel without being added to each one).
4. Send, edit, and soft-delete a message (author-only for edit/delete).
5. Per-thread/per-channel read state and an aggregate unread-count badge in the sidebar.
6. A "Message" action wherever a person already appears elsewhere in the app (members panel, assignee
   pickers), opening a DM thread with them directly.

### Deferred scope

Do not include these in the first release:

- group DMs (more than two participants in a non-channel thread);
- project-level channels (a project can have zero-to-many teams; a project-level channel would either
  duplicate a single-team project's channel or need its own separate concept for multi-team ones — add
  later only if real usage shows a gap);
- message reactions, threading/replies-within-a-thread, rich text, or file attachments in messages;
- push notifications (in-app unread state only for v1; see PRODUCT-READINESS-ROADMAP.md's notifications
  item for the broader notification system this could later plug into);
- WebSocket/SSE-based real-time delivery (see below).

### Real-time approach: polling, not WebSockets/SSE

There is no persistent-connection infrastructure anywhere in this app today, and adding one is real new
operational surface (reconnect logic, proxy/timeout configuration behind Caddy) for a small-org feature
that does not need sub-second latency. Use short-interval polling while a thread/channel is open
(roughly 8–15s), plus an immediate refetch after the current user sends — the same "refetch after
action" pattern already used everywhere else in this app. Poll the aggregate unread-count badge less
often (roughly 30s). If usage ever justifies it, Server-Sent Events is the natural upgrade path (cheaper
to add to Express than WebSockets, fits this app's already read-mostly request pattern) — a future
decision, not built now.

## Data model

Add these tables to `server/src/db/schema.sql` as `CREATE TABLE IF NOT EXISTS` (brand new tables need no
migration guard — a fresh install and an upgrade of an existing database both pick them up identically
on next boot).

### Direct messages

`dm_threads`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `workspace_id` | Owning workspace |
| `user_a_id`, `user_b_id` | The two participants — always store the lower user id as `user_a_id` so a pair can never end up with two separate threads |
| `created_at` | Creation timestamp |

Unique constraint on `(workspace_id, user_a_id, user_b_id)`.

`dm_messages`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `thread_id` | Owning thread |
| `user_id` | Author; `ON DELETE SET NULL` so a deleted account's message history isn't destroyed |
| `body` | Message text |
| `created_at`, `edited_at` | Timestamps |
| `deleted_at` | Soft delete — the UI renders "message deleted" in place, a different pattern from `task_activity`'s hard delete |

`dm_read_state`

| Column | Purpose |
| --- | --- |
| `thread_id`, `user_id` | Composite primary key |
| `last_read_message_id` | High-water mark for unread-count computation |

### Channels

`channels`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `workspace_id` | Owning workspace |
| `team_id` | `NULL` for the workspace-general channel; set for a team channel |
| `scope` | `workspace` or `team` |
| `name` | Display name |
| `created_at` | Creation timestamp |

Unique constraint on `team_id` caps a team at one channel; `NULL` rows (every workspace's general
channel) are exempt from that constraint by SQLite's NULL-uniqueness semantics, so "one general channel
per workspace" must be enforced in application code instead — created once, at workspace-creation time,
with no user-facing "add another general channel" action.

`channel_messages` and `channel_read_state` mirror `dm_messages`/`dm_read_state`'s shape exactly
(`channel_id` in place of `thread_id`).

### Backfill migration (Channels only)

Every workspace and team created **before** this ships needs a general/team channel inserted for it —
the one migration in this whole plan that inserts derived rows for existing data rather than only adding
a table or column. In `server/src/db/index.js`: a guarded insert of a general channel for every
workspace lacking one, and a team channel for every team lacking one. Dry-run this against a checkpointed
copy of the production database with an explicit before/after row-count diff, more carefully than an
ordinary schema-only change — this is the one migration in the whole plan that writes new application
data, not just structure.

## Backend implementation

### Direct messages — `server/src/routes/dm.js`

Mount `app.use('/api/dm', requireAuth, dmRoutes)`. **Deliberately not behind `requireWorkspace`** — see
the viewer carve-out below — each route resolves `roleFor()` itself instead.

| Endpoint | Responsibility |
| --- | --- |
| `GET /threads` | List the caller's DM threads in the active workspace, with unread counts |
| `POST /threads {user_id}` | Find-or-create a thread with another workspace member |
| `GET /threads/:id/messages?after_id=` | Paginated/incremental message fetch for polling |
| `POST /threads/:id/messages {body}` | Send a message; participant only |
| `PATCH /threads/:id/messages/:messageId` | Edit; author only |
| `DELETE /threads/:id/messages/:messageId` | Soft delete; author only |
| `POST /threads/:id/read` | Advance the caller's read state |
| `GET /unread-count` | Aggregate badge count |

`POST /threads` must verify the target user is actually a member of the active workspace before creating
a thread — a DM cannot be opened with someone outside the workspace.

### Channels — `server/src/routes/channels.js`

Mount `app.use('/api/channels', requireAuth, channelRoutes)`, the same not-behind-`requireWorkspace`
pattern as `dm.js`.

| Endpoint | Responsibility |
| --- | --- |
| `GET /channels` | List channels visible to the caller (general + any team channel they're on, or every team channel if manager+) |
| `GET /channels/:id/messages?after_id=` | Paginated/incremental fetch; visibility required |
| `POST /channels/:id/messages {body}` | Send; visibility required to post |
| `PATCH /channels/:id/messages/:messageId` | Edit; author only |
| `DELETE /channels/:id/messages/:messageId` | Soft delete; author only |
| `POST /channels/:id/read` | Advance the caller's read state |

Auto-creation: insert a team channel inside `teams.js`'s `POST` transaction when a team is created;
insert a general channel inside `workspaces.js`'s `POST` transaction (alongside the existing
`seedDefaultWorkflow()` call).

### Deliberate policy carve-out — flag for explicit sign-off before shipping

Unlike every other non-GET route in this app, **messaging allows viewer role to post** — both DMs and
channels. Being read-only for task/project *data* should not mean a viewer cannot talk to a colleague.
This mirrors the reasoning that already keeps `attachments.js` outside `requireWorkspace` for its own
(different) purpose. This is the second explicit "viewer can write" carve-out in the app after none
existing before this plan — call it out to the deployment owner before it ships, the same way the
original phased roadmap flagged it.

## Frontend implementation

- New Sidebar nav item "Messages" with an unread badge (aggregate of DM + channel unread), placed in the
  existing "Views" band.
- New `web/src/pages/Messages.jsx` — a DM-thread list and a channel list, both polling on the cadence
  described above while the page is open.
- New `web/src/components/DmThread.jsx`, visually modeled on `TaskActivity.jsx`'s comment rendering
  (avatar, name, timestamp, body) with its own edit/soft-delete affordances (pencil/trash icons on the
  author's own messages only) instead of `TaskActivity`'s single delete-only action.
- A "Message" action added wherever a member already appears — `MembersPanel.jsx`, assignee pickers —
  opening (or creating) that person's DM thread directly.
- `App.jsx` gains a new `view.type === 'messages'` case.
- When channels ship, extend `Messages.jsx` with a "Channels" section; generalize `DmThread.jsx` into a
  shared `MessageThread.jsx` component if the DM and channel message shapes converge cleanly enough to
  avoid duplicated rendering logic.
- Add DM/channel API methods to `web/src/lib/api.js`, keeping the existing active-workspace header
  behavior (`X-Workspace-Id`) even though the routes themselves resolve role via `roleFor()` rather than
  `requireWorkspace`.

## Authorization and security

- Every DM/channel route checks `roleFor(req.user, workspaceId)` directly (no `requireWorkspace`
  middleware in the chain) — never assume a role because a request merely carries a workspace header.
- A DM thread's two participants are fixed at creation; verify the caller is one of them on every
  message read/write.
- Channel visibility is a **read** concern independent of anything else in the permission model: general
  = every workspace member; team channel = that team's members plus manager+. This affects visibility
  only, never authorization elsewhere in the app — no other route's behavior changes because of channel
  membership.
- Edit/delete of a message is author-only, with no manager override in the first release (unlike task
  comments, which also have no manager-delete override today — stay consistent with that existing
  precedent rather than introducing a new one here).
- Soft-deleted message bodies are still retrievable in the database (not physically erased) — treat the
  `deleted_at` column, not the row's absence, as the authorization-relevant state if a future audit or
  moderation feature needs the original text.

## Delivery phases

### Phase 11: Direct messages

No dependency on anything else in this plan. Ship `dm_threads`/`dm_messages`/`dm_read_state`, `dm.js`,
`Messages.jsx`'s DM half, and the "Message" action wherever members appear. Verify: a viewer successfully
posts a DM (confirms the carve-out); a non-member cannot open a thread with a workspace member;
non-author edit/delete both 403; two real sessions DM each other and see the unread badge and soft-
delete rendering update correctly.

### Phase 12: Channels

Depends on Teams (already shipped) and the DM infrastructure above (shared message/read-state shape).
Ship `channels`/`channel_messages`/`channel_read_state`, `channels.js`, the backfill migration, and
`Messages.jsx`'s Channels section. Verify: a developer not on "QA Team" gets a channel list without QA
Team's channel, while a manager sees it; a viewer posts in the general channel successfully; posting in
a team channel is never visible to a non-member developer even after a refresh; the backfill migration's
before/after row counts match exactly (one general channel per pre-existing workspace, one channel per
pre-existing team, no duplicates on a second boot).

## Acceptance criteria

- Two workspace members can start a DM thread and exchange messages without needing a shared task.
- A DM thread is never created between two people who are not both members of the same workspace.
- Every workspace has exactly one general channel, auto-created, visible to every member including
  viewer role.
- Every team has exactly one channel, auto-created, visible to that team's members and to manager+
  workspace-wide.
- A developer who is not on a given team never sees that team's channel in their channel list, under any
  request path.
- Editing or deleting a message is possible only for its author, in both DMs and channels.
- Viewer role can post in both DMs and channels — the one deliberate, explicitly-flagged exception to
  this app's "viewer is read-only" default.
- Existing task comments (`task_activity`) are untouched by this feature — messaging is additive, not a
  replacement.
- The pre-existing-data backfill migration for channels produces exactly one general channel per
  pre-existing workspace and one channel per pre-existing team, verified by an explicit row-count diff
  against a checkpointed copy of the production database before release.
