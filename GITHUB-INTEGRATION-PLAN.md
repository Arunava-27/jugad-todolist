# GitHub Integration Plan

## Goal

Let a Punchlist project track the engineering work that happens in selected GitHub repositories:

- show linked repositories and their current issue/PR activity;
- represent selected GitHub issues and pull requests as Punchlist tasks;
- keep status and links current from GitHub webhooks;
- optionally connect a Punchlist project to a GitHub Projects (Projects v2) board.

The integration must preserve Punchlist's organization and workspace boundaries. It must not require
users to paste long-lived GitHub personal access tokens into Punchlist.

## Product decisions

### Integration model

Use a **GitHub App**, not a classic OAuth app or a manually entered PAT.

A GitHub App can be installed on a personal account or organization, restricted to explicitly chosen
repositories, granted narrow permissions, and subscribed to webhooks. Punchlist will authenticate
as the installation using short-lived installation access tokens. This is the appropriate model for
background synchronization even when the Punchlist user is offline.

The Punchlist organization owner connects the app. Managers can link repositories from installed
accounts to projects in workspaces they manage. A project can link multiple repositories, but each
repository can be linked only once within the same Punchlist organization unless a later product
decision explicitly permits separate mappings.

### First release scope

1. Connect/disconnect a GitHub App installation at the Punchlist organization level.
2. Select repositories available to that installation.
3. Link one or more selected repositories to a Punchlist project.
4. Import open GitHub issues and pull requests as linked Punchlist tasks.
5. Synchronize GitHub issue/PR state, title, URL, labels, assignees, and milestone through webhooks.
6. Display GitHub links and sync status in the project overview and task modal.
7. Offer a manual "Sync now" action and record sync errors for managers.

For the first release, GitHub is authoritative for GitHub-owned fields:

- issue/PR title;
- open/closed/merged state;
- GitHub labels;
- GitHub URL and number;
- GitHub assignees when they can be matched to a Punchlist user.

Punchlist remains authoritative for its own fields:

- sections;
- Punchlist-specific priority, due date, estimate, comments, attachments, and subtasks;
- Punchlist-only labels and assignees;
- task completion when a task is not linked to GitHub.

Closing a linked GitHub issue or merging/closing a linked PR marks the corresponding Punchlist task
complete. Reopening it reopens the Punchlist task. Editing or deleting a Punchlist task must never
silently edit or close the GitHub issue in the first release.

### Deferred scope

Do not include these in the first release:

- creating or modifying GitHub issues/PRs from Punchlist;
- syncing commits, deployments, checks, or GitHub Discussions;
- GitHub Enterprise Server support;
- bidirectional GitHub Projects v2 item/field synchronization;
- automatic creation/deletion of Punchlist users for GitHub users;
- importing a repository's entire historical issue/PR archive.

GitHub Projects v2 should be implemented as a second phase after repository/issue/PR synchronization
is stable. Projects v2 requires GitHub's GraphQL API and needs explicit field-mapping rules.

## GitHub App setup

Create a GitHub App owned by the Punchlist deployment owner.

Configure:

- **Homepage URL:** the public Punchlist URL.
- **Setup URL:** `https://<punchlist-host>/api/github/installations/complete`.
- **Webhook URL:** `https://<punchlist-host>/api/github/webhook`.
- **Webhook secret:** a high-entropy value stored only in deployment configuration.
- **Repository access:** allow installation on selected repositories only.
- **Permissions:** repository metadata read, issues read, pull requests read, and repository projects
  read only when Projects v2 support is enabled.
- **Webhook subscriptions:** `installation`, `installation_repositories`, `issues`, `pull_request`,
  `label`, `milestone`, and `repository`. Add GitHub Projects v2 events only in phase two.

Add these required deployment values to `.env.example`, `docker-compose.yml`, `DEPLOY.md`, and the
application startup validation:

```text
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
```

`GITHUB_APP_PRIVATE_KEY` must support multiline PEM configuration safely. Document a base64-encoded
form if the deployment target cannot reliably preserve newlines. Never expose any of these values in
the frontend, API response, logs, or database.

## Data model

Add migration-safe tables and indexes in `server/src/db/schema.sql` and the guarded migration logic
in `server/src/db/index.js`.

### Organization installation

`github_installations`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `organization_id` | Punchlist organization that owns the connection |
| `github_installation_id` | GitHub installation ID, unique |
| `github_account_id` | GitHub owner account ID |
| `github_account_login` | GitHub owner login for display |
| `github_account_type` | `Organization` or `User` |
| `repository_selection` | GitHub installation selection mode |
| `status` | `active`, `suspended`, or `removed` |
| `installed_by` | Punchlist user who initiated installation |
| `installed_at`, `updated_at`, `removed_at` | Audit and lifecycle timestamps |

Use a unique constraint on `github_installation_id` and an index on `organization_id`.

### Repositories and project links

`github_repositories`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `installation_id` | Owning GitHub App installation |
| `github_repository_id` | Immutable GitHub repository node/database ID |
| `owner_login`, `name`, `full_name` | Display and lookup fields |
| `html_url`, `default_branch`, `is_archived`, `is_private` | Cached repository metadata |
| `installed_at`, `updated_at` | Synchronization timestamps |

`project_github_repositories`

| Column | Purpose |
| --- | --- |
| `project_id` | Linked Punchlist project |
| `github_repository_id` | Linked repository record |
| `linked_by`, `linked_at` | Audit data |
| `last_synced_at`, `last_sync_error` | Visible synchronization state |

Enforce one link per `(project_id, github_repository_id)` and prevent accidental cross-organization
links in application authorization.

### Linked work items

`github_work_items`

| Column | Purpose |
| --- | --- |
| `id` | Local primary key |
| `task_id` | Corresponding Punchlist task; unique |
| `github_repository_id` | Source repository |
| `github_item_id` | Immutable GitHub issue/PR ID |
| `number` | Repository-local issue/PR number |
| `kind` | `issue` or `pull_request` |
| `node_id`, `html_url` | GitHub identity and deep link |
| `state`, `is_merged`, `closed_at` | Current GitHub lifecycle |
| `last_github_updated_at`, `synced_at` | Conflict and sync tracking |

Use unique constraints on `(github_repository_id, github_item_id)` and `task_id`. Store GitHub data
needed for display on the task itself only when it is useful for filtering; keep the canonical link
metadata in this table.

### Delivery and job history

`github_webhook_deliveries`

- GitHub delivery ID (unique), event name, installation ID, received timestamp, processing status,
  error message, and completed timestamp.
- Retain minimal metadata only; do not store full webhook payloads indefinitely because issue and PR
  bodies can contain sensitive material.

`github_sync_runs`

- project/repository target, trigger (`initial_import`, `manual`, `webhook_recovery`), started and
  completed timestamps, item counts, status, and a bounded error message.

## Backend implementation

### GitHub service layer

Create `server/src/lib/githubApp.js` and `server/src/lib/githubClient.js`.

`githubApp.js` will:

1. Load and validate the GitHub App configuration.
2. Create an RS256 JWT signed with the configured private key.
3. Exchange the JWT for a short-lived installation access token.
4. Cache installation tokens in memory until shortly before expiration.
5. Invalidate cached tokens after installation suspension/removal events.

`githubClient.js` will wrap GitHub REST requests and normalize API errors. It must include:

- explicit timeouts;
- GitHub API version and Accept headers;
- pagination;
- rate-limit-aware error messages;
- no broad catch-and-ignore behavior.

Keep raw GitHub API payloads out of route handlers. Convert them to a small internal normalized shape
before synchronizing them.

### Installation lifecycle routes

Create `server/src/routes/github.js`, mounted under `/api/github` with `requireAuth`.

| Endpoint | Authorization | Responsibility |
| --- | --- | --- |
| `GET /installations` | organization owner/admin | List organization installations and status |
| `POST /installations/start` | organization owner | Create a state-bound GitHub App installation URL |
| `GET /installations/complete` | authenticated initiating user | Validate signed state, verify installation access, persist installation, then redirect to the connector UI |
| `DELETE /installations/:id` | organization owner | Disconnect locally and direct the user to uninstall or update selection on GitHub |
| `GET /repositories` | manager+ in active workspace | List selectable repositories belonging to active-org installations |
| `POST /projects/:projectId/repositories` | manager+ | Link an installed repository to a project |
| `DELETE /projects/:projectId/repositories/:repositoryId` | manager+ | Remove a project-repository link without changing GitHub |
| `POST /projects/:projectId/repositories/:repositoryId/sync` | manager+ | Queue or run a bounded manual import/sync |

Use an encrypted, short-lived, single-use installation state record or signed state value that binds
the callback to the initiating Punchlist user and organization. Do not trust an installation ID passed
by the browser without verifying it through the GitHub App API and checking that it belongs to the
expected organization/account.

### Webhook route

Mount `POST /api/github/webhook` **before** the global `express.json()` middleware so the handler
receives the exact raw request body required for signature verification.

The webhook handler must:

1. Require `X-Hub-Signature-256`, `X-GitHub-Event`, and `X-GitHub-Delivery`.
2. Verify the HMAC SHA-256 signature over the unmodified raw bytes using
   `crypto.timingSafeEqual`.
3. Deduplicate on the delivery ID before processing.
4. Respond quickly after durable receipt; run the minimal relevant sync operation rather than doing
   unbounded imports in the request.
5. Record a failure with actionable internal detail, but return no sensitive GitHub data to callers.

Handle event changes idempotently:

- installation created/suspended/deleted;
- repository added/removed/renamed/archived;
- issue opened, edited, closed, reopened, labeled, unlabeled, assigned, unassigned;
- pull request opened, edited, closed, reopened, converted/marked ready, labeled, unlabeled,
  assigned, unassigned.

Only update a Punchlist task when its corresponding `github_work_items` row exists. A GitHub webhook
must not create a flood of tasks merely because a repository was installed.

### Synchronization behavior

Initial import and manual sync:

1. Fetch only open issues and open pull requests for the linked repository.
2. Exclude pull requests from issue results to avoid duplicates.
3. Present a selection/preview UI before importing unless an explicit "import all open items" action
   is selected.
4. Create a Punchlist task with a GitHub badge, title, URL, GitHub labels, and mapped assignee(s).
5. Put imported tasks into a configurable default section/status. Do not overwrite the workspace's
   customized status model.
6. Save a durable `github_work_items` mapping.

Subsequent sync:

- update the title and GitHub lifecycle fields;
- close/reopen the linked Punchlist task for closed/reopened GitHub items;
- add an immutable task-activity entry such as "GitHub issue #42 closed";
- never overwrite Punchlist-only descriptions, comments, dates, section, priority, attachments, or
  local subtasks;
- identify GitHub user-to-Punchlist user mappings only by a deliberately connected GitHub identity
  in a later phase; do not guess based on display name or email.

For the first release, show GitHub assignee logins as external metadata. Add a user-initiated account
linking flow before assigning Punchlist users automatically.

### GitHub Projects v2 phase

After issue/PR sync is proven:

1. Add an optional `project_github_projects` mapping with GitHub Project node ID, title, URL, and
   selected field mappings.
2. Use GraphQL to list project items and fields.
3. Support read-only rollup first: item status, iteration, and target date on Punchlist project
   overview.
4. Require the manager to map each GitHub Project field to a Punchlist concept explicitly.
5. Add one-directional GitHub-to-Punchlist synchronization before any bidirectional updates.

Do not make GitHub Projects v2 the source of truth for Punchlist task sections or statuses without a
clear conflict-resolution policy.

## Frontend implementation

### Organization connector settings

Add a **GitHub** panel under Settings → Connectors:

- connection state and installed GitHub organization/account;
- "Connect GitHub" button for owners;
- repository-selection link back to GitHub;
- installation status, last successful sync, and actionable error state;
- disconnect confirmation that explains it stops future synchronization but preserves Punchlist tasks.

### Project overview

Add a **GitHub** section to `ProjectOverview` for managers:

- linked repository chips with private/archive state;
- connect/remove repository actions;
- latest sync timestamp and "Sync now";
- issue/PR counts by open/closed state;
- filtered list of linked work items and deep links to GitHub.

For all project members, display linked repository and GitHub issue/PR URLs read-only.

### Task UI

Update `TaskModal`, `TaskRow`, list, and board cards:

- display an issue or PR badge, repository name, number, and external-link icon;
- display GitHub state separately from configurable Punchlist status;
- identify the task as GitHub-linked;
- make the GitHub-provided title behavior clear;
- preserve existing task interaction patterns and viewer read-only behavior.

Add API methods to `web/src/lib/api.js` for installation, repository-link, and sync endpoints. Keep
the existing active-workspace header behavior.

## Authorization and security

- Installation visibility and management are organization-scoped. Verify every installation,
  repository, project, and workspace belongs to the active user's organization.
- Organization owner initiates and removes integrations. Manager+ can link repositories only to
  projects they can manage.
- Viewer and stakeholder users get no GitHub management actions. Stakeholders should see at most
  project-level repository names/links that the organization elects to expose; default to hiding
  GitHub work-item details from stakeholder summaries.
- Verify all webhook signatures against raw bytes using constant-time comparison.
- Treat webhook payload fields as untrusted input. Validate types and lengths before database writes.
- Never persist GitHub installation access tokens, raw private keys, webhook secrets, or full webhook
  payloads in SQLite.
- Use parameterized SQLite queries and enforce foreign-key ownership checks in every route.
- Apply endpoint rate limits to install start, manual sync, and webhook processing.
- Log configuration and sync errors without logging credentials, authorization headers, or full
  third-party payloads.

## Delivery phases

### Phase 1: foundation

1. Register/configure the GitHub App and deployment environment variables.
2. Add database migrations, service layer, installation state handling, and organization connector
   routes.
3. Add signature-verified webhook receipt and delivery deduplication.
4. Add tests for configuration validation, JWT/token generation boundaries, callback-state validation,
   webhook signature verification, and organization isolation.

### Phase 2: repository linking and import

1. Build connector and project-overview repository selection UI.
2. Add repository discovery, project links, bounded manual sync, and sync history.
3. Import selected open issues/PRs into linked Punchlist tasks.
4. Add task badges/deep links and sync-state feedback.
5. Test authorization, pagination, duplicate prevention, and customized workspace workflows.

### Phase 3: live updates and resilience

1. Process issue/PR/repository lifecycle webhooks idempotently.
2. Update linked tasks and activity records.
3. Add retry/recovery for failed deliveries and a visible manager-facing error state.
4. Test duplicate/out-of-order deliveries, reinstalls, repository removal, rate limits, and invalid
   signatures.

### Phase 4: GitHub Projects v2

1. Add read-only project-board rollup with explicit field mapping.
2. Validate GraphQL pagination, permissions, and field-type handling.
3. Decide and document a conflict policy before enabling any write-back.

## Acceptance criteria

- An organization owner can connect a GitHub App installation without sharing a GitHub PAT.
- A manager can link only repositories available through an installation belonging to their Punchlist
  organization.
- A selected GitHub issue or PR imports once into the intended Punchlist project, with a durable
  GitHub mapping and working external link.
- Closing/reopening an imported issue or PR updates only its linked Punchlist task, even when the
  webhook is delivered more than once.
- Removing a repository link stops future synchronization and preserves existing Punchlist tasks.
- Invalid, missing, modified, and replayed webhooks are rejected or deduplicated safely.
- A user cannot access or link another organization's installations or repositories.
- Existing non-GitHub projects, tasks, roles, stakeholder views, MCP access, and secret handling
  retain their current behavior.
- Automated tests cover authorization, webhook verification, duplicate prevention, and GitHub API
  failure handling before the feature is released.

## References

- GitHub Apps provide repository-scoped permissions, installations, and built-in webhooks:
  <https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps>
- GitHub requires webhook delivery signatures to be verified from the raw payload using the webhook
  secret and a constant-time comparison:
  <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>
