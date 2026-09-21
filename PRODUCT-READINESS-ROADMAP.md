# Punchlist Industry-Readiness and Product Roadmap

## Purpose

Punchlist already has a substantial product foundation: multi-tenant organizations, workspaces,
role-based permissions, stakeholder access, project/task workflows, encrypted project secrets,
OAuth/MCP support, and containerized deployment.

This roadmap prioritizes making that foundation dependable, secure, observable, and maintainable
before expanding the product surface area.

## Priority order

| Priority | Focus | Outcome |
| --- | --- | --- |
| 1 | Automated tests, linting, and CI | Changes can be released with confidence. |
| 2 | Production configuration hardening | Deployments fail safely rather than run with insecure defaults. |
| 3 | Auditability and observability | Operators can investigate failures and sensitive actions. |
| 4 | Database and operational maturity | Backups, restores, migrations, and future scale are planned and testable. |
| 5 | GitHub App integration | Projects can track the engineering work happening in repositories. |
| 6 | Collaboration and workflow UX | Teams can plan, communicate, and execute work more effectively. |

## 1. Engineering quality and release safety

### Automated testing

Add a test framework and targeted test suites for:

- authentication, registration, invitation acceptance, and session behavior;
- role and workspace authorization boundaries;
- organization tenancy isolation;
- project, task, section, status, priority, label, and assignment behavior;
- stakeholder read-only access;
- token, OAuth, MCP, attachment, and secret access controls;
- database migrations and first-run seeding;
- key frontend interaction flows.

Prioritize regression tests for existing authorization-sensitive routes before adding major
integrations.

### Linting, formatting, and type safety

- Add linting for server and web workspaces.
- Add formatting checks that run in CI.
- Introduce static type checking incrementally, starting with the API contracts and shared data
  shapes. TypeScript is preferred for new complex modules, but an incremental JSDoc-based approach
  is acceptable if a full migration would interrupt feature delivery.
- Define API response and validation schemas once and reuse them where possible.

### Continuous integration

Create a pull-request workflow that:

1. installs locked dependencies;
2. runs lint and formatting checks;
3. runs backend and frontend tests;
4. builds the Vite application;
5. runs database migration tests against a clean temporary database;
6. performs dependency and secret scanning.

Protect the default branch so required checks must pass before merge.

## 2. Production security and configuration

### Required production configuration

At startup in production:

- reject missing, weak, or placeholder `SESSION_SECRET`;
- reject missing or invalid `SECRET_MASTER_KEY` when secrets are enabled;
- require an explicit allowed frontend origin instead of permissive CORS;
- require HTTPS-aware secure-cookie configuration;
- log safe configuration diagnostics without printing credentials.

Document required, optional, and feature-specific environment variables in `.env.example` and
`DEPLOY.md`.

### Account security

Add:

- email verification for newly registered accounts;
- password-reset flow with short-lived, single-use tokens;
- account/session management with a list of active sessions and remote sign-out;
- optional two-factor authentication;
- configurable organization-level sign-up and authentication policies;
- account lockout or progressive backoff after repeated failed logins.

### API security and resilience

- Apply consistent Zod validation and explicit limits to request parameters and bodies.
- Add pagination, bounded result sizes, and stable sorting to every endpoint that can grow.
- Rate-limit authentication, invitation, OAuth, GitHub integration, and webhook endpoints.
- Version public APIs before external clients depend on them.
- Define an upload policy: permitted MIME types, file-size limits, malware scanning if exposed to
  untrusted users, and retention/deletion behavior.

## 3. Auditability and observability

### Organization audit log

Extend the existing secret-access audit pattern to organization-wide events:

- organization settings changes;
- user creation, deactivation, deletion, and role changes;
- workspace membership and invitation changes;
- workspace/project creation, archive, and deletion;
- integration installation, repository linking, and disconnect events;
- sensitive secret sharing and access events.

Audit entries should contain actor, organization, target, action, timestamp, and a safe metadata
summary. They must not include passwords, raw tokens, secret values, or full third-party payloads.

### Operational visibility

Add:

- structured server logs with request ID, route, response status, latency, and safe actor context;
- centralized error tracking for frontend and backend exceptions;
- health and readiness endpoints for deployments;
- alerting for repeated authentication failures, failed jobs, backup failures, and unexpected error
  rates;
- a manager/owner-facing integration status screen with clear recovery instructions.

## 4. Database, backups, and operations

### SQLite maturity

SQLite with WAL is appropriate for the current single-instance self-hosted target. Formalize that
operating model:

- document single-writer/single-instance expectations;
- make database location, backup location, retention, and restore steps explicit;
- schedule backups and verify them by restoring periodically into a disposable environment;
- monitor database size, disk space, and backup success;
- test migrations against production-like copies before release.

### Future PostgreSQL path

Do not migrate prematurely. First:

- isolate database access behind repositories/services where practical;
- avoid SQLite-specific SQL outside migration/DB modules;
- retain migration history and forward-only schema changes;
- define performance and concurrency thresholds that would justify PostgreSQL.

Migrate when concurrent writes, deployment topology, reporting load, or operational requirements
outgrow a single SQLite instance.

### Background jobs

Introduce durable background jobs for work that should not block HTTP requests:

- email and invitation delivery;
- GitHub synchronization and webhook recovery;
- notifications;
- imports and exports;
- backup verification;
- scheduled recurring tasks.

Each job needs an idempotency key, retry policy with backoff, bounded error history, and visible
status for operators.

## 5. GitHub integration

Implement the GitHub App integration described in
[GITHUB-INTEGRATION-PLAN.md](GITHUB-INTEGRATION-PLAN.md).

Sequence:

1. organization-level GitHub App installation with selected-repository access;
2. project-to-repository links;
3. selected issue/PR import as linked Punchlist tasks;
4. signature-verified, idempotent webhook synchronization;
5. sync visibility and error recovery;
6. GitHub Projects v2 read-only rollups and explicit field mapping;
7. only then consider carefully scoped write-back.

Use GitHub App installation tokens and webhook verification. Do not collect long-lived GitHub
personal access tokens from Punchlist users.

## 6. Collaboration and workflow features

### Direct messages and channels

Implement the messaging system described in [MESSAGING-PLAN.md](MESSAGING-PLAN.md): 1:1 direct
messages between workspace members, a workspace-wide general channel, and a channel per project team —
separate from task comments, which stay task-scoped.

Sequence:

1. direct message threads, polling-based delivery, unread state;
2. team/workspace channels, built on the same message/read-state shape, including the backfill
   migration for workspaces and teams that predate the feature.

This is the one place in the whole permission model where viewer role is deliberately allowed to write
(post a message) — flag it for explicit sign-off before release, same as any other deliberate exception
to the read-only-viewer default.

### Task dependencies and blockers

Add task relationships:

- task blocks task;
- task is blocked by task;
- optional external blocker with owner and expected resolution date;
- dependency graph/list on task details and project overview;
- blocked-work alerts and an explicit project risk view.

Prevent invalid self-dependencies and circular dependency chains.

### Notifications and mentions

Start with in-app notifications, then add optional email delivery:

- assignment and unassignment;
- task comments and `@mentions`;
- approaching/overdue due dates;
- status changes and blockers;
- project stakeholder updates;
- GitHub issue/PR changes for linked tasks.

Support per-user notification preferences, notification read state, and grouped/digested delivery to
avoid noise.

### Recurring tasks and templates

Add:

- recurring task schedules with timezone-aware generation;
- reusable task templates;
- reusable project templates that define default sections, tasks, labels, roles, and timelines;
- template versioning or safe copy-on-create behavior so later template edits do not unexpectedly
  change existing projects.

### Planning and capacity

Build on the existing dashboard:

- milestones and project target dates;
- task estimates and remaining work;
- workload timeline by person/team;
- sprint or cycle planning;
- capacity forecasting;
- project health indicators for blocked work, overdue tasks, scope growth, and delivery risk.

Keep estimates and capacity advisory rather than presenting them as precise schedules.

### Search, views, and reporting

Add:

- global search across projects, tasks, comments, labels, and people, with permission filtering;
- advanced task filters;
- saved views shared with a workspace or private to a user;
- custom project/workspace reports;
- CSV/JSON export with authorization and audit logging;
- configurable dashboards for managers and owners.

### Mobile and PWA maturity

Improve the installable web experience:

- responsive task editing and project views;
- offline-capable quick capture with clear sync state;
- conflict-safe synchronization after reconnect;
- supported browser notification flow;
- accessible keyboard and screen-reader interactions;
- performance budgets for slow devices and weak connections.

## 7. Extensible integrations framework

Treat GitHub as the first provider in a reusable connector architecture.

Common connector capabilities:

- organization-scoped installation/configuration;
- least-privilege permissions;
- encrypted credentials when persistent credentials are unavoidable;
- health status, last sync, and error history;
- webhook verification and delivery deduplication;
- background jobs and retry rules;
- explicit ownership mapping and authorization checks;
- disconnect and data-retention behavior.

Potential next integrations:

1. Slack or Microsoft Teams notifications and task actions.
2. Calendar synchronization for due dates, milestones, and planning.
3. Email-to-task capture.
4. Generic outbound webhooks for organization automations.
5. Import/export connectors for migration and reporting.

## Suggested delivery sequence

### Milestone A: reliable foundation — Complete

- [x] Tests, linting, formatting, CI, and branch protections.
- [x] Production configuration validation.
- [x] Structured logs, health checks, and error tracking.
- [x] Database backup/restore testing.

### Milestone B: secure collaboration — In progress

- [x] Password reset, email verification, session management, and optional two-factor authentication.
- [ ] Organization audit log.
- [ ] Direct messages, then channels (see MESSAGING-PLAN.md).
- [ ] Notifications and mentions.
- [ ] Task dependencies and blocker tracking.

### Milestone C: connected engineering workflow

- GitHub App installation, repository links, issue/PR import, and webhook sync.
- Background job infrastructure.
- Integration health/status UI.

### Milestone D: planning and scale

- Recurring tasks and templates.
- Advanced search, saved views, reporting, milestones, and capacity planning.
- GitHub Projects v2 rollup.
- Reassess whether PostgreSQL is warranted using real load and concurrency evidence.

## Success criteria

Punchlist is ready for broader industry use when:

- every pull request is automatically built, linted, and tested;
- production deployments cannot start with insecure secret/configuration defaults;
- owners can audit sensitive actions and diagnose failed integrations;
- backup restores and schema migrations are routinely validated;
- users can recover accounts and manage active sessions safely;
- GitHub work is visible in the appropriate Punchlist project without violating organization,
  workspace, or stakeholder permissions;
- workspace members can message each other directly and by team/general channel, with viewer role's
  one deliberate write exception clearly documented rather than accidental;
- collaboration workflows support blockers, notifications, recurring work, templates, and
  discoverable reporting;
- the system has explicit limits and operational guidance for its SQLite single-instance deployment.
