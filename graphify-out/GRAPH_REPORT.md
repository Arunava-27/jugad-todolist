# Graph Report - jugad-todolist  (2026-09-21)

## Corpus Check
- 114 files · ~75,930 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .webmanifest 1)

## Summary
- 682 nodes · 1479 edges · 46 communities (41 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.87)
- Token cost: 0 input · 120,852 output

## Community Hubs (Navigation)
- Frontend UI Components
- Server Dependencies & Config
- Frontend Build Tooling
- Core App & CRUD Routes
- App Bootstrap & Error Handling
- Attachments & Secrets Storage
- Test Suite & Helpers
- OAuth Authorization Server
- MCP Server & Tasks API
- GitHub Integration Plan
- Sessions & Auth Routes
- Messaging Plan (DMs/Channels)
- Monorepo Root Scripts
- Tokens & Members UI
- TOTP 2FA Implementation
- Notion Import Script
- Theme & Appearance Settings
- Auth Middleware & Invites
- Task Modal & Attachments
- DB Migrations & Workspaces
- Project Secrets UI
- Quick-Add Task Parser
- Admin Page (Org Management)
- Deploy Guide (DigitalOcean)
- Permissions & Teams Route
- Config Validation & Logging
- CI/CD Pipeline
- Security Settings UI
- Landing Page
- Roadmap Priorities Overview
- Secret Encryption (AES-GCM)
- Project Teams UI
- Docker Compose Deployment
- Transactional Email Sending
- Settings List UI
- Sectioned Task List UI
- Sidebar Navigation UI
- Roles & Multi-Tenancy Docs
- Password Hashing & Credentials
- Task Activity & Comments UI
- SQLite Operating Model Docs
- Dialog Host UI
- Login Page (incl. 2FA)
- DB Backup Script
- DB Restore Script
- HTML Shell & Mount

## God Nodes (most connected - your core abstractions)
1. `alertDialog()` - 60 edges
2. `react` - 32 edges
3. `confirmDialog()` - 29 edges
4. `db` - 27 edges
5. `api` - 21 edges
6. `express` - 20 edges
7. `App()` - 20 edges
8. `initials()` - 20 edges
9. `colorForPerson()` - 20 edges
10. `Icon()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Organization Roles (Admin/Manager/Developer/Viewer)` --semantically_similar_to--> `Roles: Owner/Admin/Manager/Developer/Viewer`  [INFERRED] [semantically similar]
  DEPLOY.md → README.md
- `Deploy Workflow` --implements--> `Milestone A: Reliable Foundation (Complete)`  [INFERRED]
  .github/workflows/deploy.yml → PRODUCT-READINESS-ROADMAP.md
- `Production Build (Docker)` --references--> `Deploying to DigitalOcean Guide`  [EXTRACTED]
  README.md → DEPLOY.md
- `app Service (Node/Express Container)` --implements--> `SQLite Single-Writer Operating Model`  [INFERRED]
  docker-compose.yml → DEPLOY.md
- `Priority 5: GitHub App Integration` --cites--> `GitHub Integration Goal`  [EXTRACTED]
  PRODUCT-READINESS-ROADMAP.md → GITHUB-INTEGRATION-PLAN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **GitHub Integration Data Model Tables** — github_integration_plan_github_installations_table, github_integration_plan_github_repositories_table, github_integration_plan_github_work_items_table, github_integration_plan_webhook_deliveries_table, github_integration_plan_sync_runs_table [EXTRACTED 1.00]
- **Messaging Backend Data & Routes** — messaging_plan_dm_threads_table, messaging_plan_channels_tables, messaging_plan_dm_routes, messaging_plan_channels_routes [EXTRACTED 1.00]
- **Punchlist Build, Test, and Deploy Pipeline** — github_workflows_ci_workflow, github_workflows_deploy_workflow, docker_compose_app_service, docker_compose_caddy_service [INFERRED 0.85]

## Communities (46 total, 5 thin omitted)

### Community 0 - "Frontend UI Components"
Cohesion: 0.07
Nodes (49): react, AttachmentLightbox(), formatSize(), BoardView(), handleDrop(), reorderColumns(), EXPIRY_OPTIONS, Icon() (+41 more)

### Community 1 - "Server Dependencies & Config"
Cohesion: 0.04
Nodes (43): better-sqlite3, cookie-session, cors, dotenv, express-rate-limit, qrcode, zod, dependencies (+35 more)

### Community 2 - "Frontend Build Tooling"
Cohesion: 0.05
Nodes (36): ref_eslint_js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, ref_globals, jsdom, react-dom, vite, @vitejs/plugin-react (+28 more)

### Community 3 - "Core App & CRUD Routes"
Cohesion: 0.13
Nodes (16): express, app, { corsOrigin }, __dirname, webDist, db, router, router (+8 more)

### Community 4 - "App Bootstrap & Error Handling"
Cohesion: 0.11
Nodes (15): App(), applyAuthResult(), dismissInvite(), handleAcceptNow(), handleAuthAndAccept(), handleCreateTask(), handleCreateWorkspace(), handleLogout() (+7 more)

### Community 5 - "Attachments & Secrets Storage"
Cohesion: 0.11
Nodes (18): multer, ref_node_fs, DATA_DIR, atLeast(), roleFor(), canAccessWorkspace(), canWrite(), router (+10 more)

### Community 6 - "Test Suite & Helpers"
Cohesion: 0.28
Nodes (12): ref_node_os, supertest, ref_vitest, consumeAuthToken(), createAuthToken(), hashToken(), addWorkspaceMember(), bootstrapOrg() (+4 more)

### Community 7 - "OAuth Authorization Server"
Cohesion: 0.13
Nodes (17): RFC-7591, RFC-7636, RFC-8414, RFC-9728, mintPersonalAccessToken(), TOKEN_PREFIX_LEN, consentPageHtml(), errorPageHtml() (+9 more)

### Community 8 - "MCP Server & Tasks API"
Cohesion: 0.16
Nodes (13): @modelcontextprotocol/sdk, checkWorkspaceAccess(), createMcpServer(), errorResult(), requireTask(), textResult(), getOrCreateLabel(), hydrateTask() (+5 more)

### Community 9 - "GitHub Integration Plan"
Cohesion: 0.15
Nodes (17): GitHub Integration Acceptance Criteria, Deferred Scope, GitHub Integration Delivery Phases, First Release Scope, github_installations Table, github_repositories / project_github_repositories Tables, server/src/routes/github.js Routes, github_work_items Table (+9 more)

### Community 10 - "Sessions & Auth Routes"
Cohesion: 0.18
Nodes (11): createSession(), hashToken(), listActiveSessions(), revokeAllSessionsForUser(), revokeSession(), revokeSessionByToken(), emailActionLimiter, loginLimiter (+3 more)

### Community 11 - "Messaging Plan (DMs/Channels)"
Cohesion: 0.15
Nodes (16): attachments.js requireWorkspace Exception, Channel Backfill Migration, Workspace/Team Channels, server/src/routes/channels.js Routes, channels / channel_messages / channel_read_state Tables, Messaging Delivery Phases (11-12), Direct Messages (1:1), server/src/routes/dm.js Routes (+8 more)

### Community 12 - "Monorepo Root Scripts"
Cohesion: 0.13
Nodes (14): name, private, scripts, build:web, dev:server, dev:web, hash-password, import-notion (+6 more)

### Community 13 - "Tokens & Members UI"
Cohesion: 0.21
Nodes (14): ConnectorTokens(), copyToken(), copyUrl(), revoke(), revokeApp(), submitCreate(), formatDate(), groupOAuthApps() (+6 more)

### Community 14 - "TOTP 2FA Implementation"
Cohesion: 0.25
Nodes (12): RFC-4226, RFC-6238, base32Decode(), base32Encode(), consumeRecoveryCode(), currentTotpCode(), generateRecoveryCodes(), generateTotpSecret() (+4 more)

### Community 15 - "Notion Import Script"
Cohesion: 0.16
Nodes (13): ref_node_path, ref_node_url, data, __dirname, EXPORT_PATH, getOrCreateLabel(), projectIdByUrl, resolveAssigneeUserId() (+5 more)

### Community 16 - "Theme & Appearance Settings"
Cohesion: 0.29
Nodes (13): ACCENT_PRESETS, applyAccent(), applyTheme(), getAccent(), getTheme(), initTheme(), inkFor(), relativeLuminance() (+5 more)

### Community 17 - "Auth Middleware & Invites"
Cohesion: 0.22
Nodes (10): resolveSession(), authenticateViaToken(), failedPatAttempts, recordFailedPatAttempt(), requireAdmin(), requireAuth(), requireWorkspace(), tooManyFailedPatAttempts() (+2 more)

### Community 18 - "Task Modal & Attachments"
Cohesion: 0.17
Nodes (5): TaskModal(), handleFilesChange(), save(), loadImage(), resizeImageForUpload()

### Community 19 - "DB Migrations & Workspaces"
Cohesion: 0.20
Nodes (9): adminEmail, DB_PATH, __dirname, hasColumn(), rebuildWithWorkspaceScope(), schema, seedDefaultWorkflow(), router (+1 more)

### Community 20 - "Project Secrets UI"
Cohesion: 0.17
Nodes (10): formatBytes(), formatDate(), formatDateTime(), ProjectSecrets(), addShare(), deleteSecret(), download(), removeShare() (+2 more)

### Community 21 - "Quick-Add Task Parser"
Cohesion: 0.27
Nodes (10): QuickAdd(), submit(), addDays(), extractDate(), nextWeekday(), parseQuickAdd(), NOW, toISO() (+2 more)

### Community 22 - "Admin Page (Org Management)"
Cohesion: 0.23
Nodes (12): handleWorkspaceSelect(), promptDialog(), Admin(), changeCapacity(), changeDomain(), changeMembership(), changeRole(), deleteUser() (+4 more)

### Community 23 - "Deploy Guide (DigitalOcean)"
Cohesion: 0.18
Nodes (11): backup-db.sh Backup Process, DigitalOcean Droplet Setup, Install Docker on Droplet, DuckDNS Free Domain, Configure .env Secrets, Deploying to DigitalOcean Guide, Import Notion Backup Step, Resend Invite Email Setup (+3 more)

### Community 24 - "Permissions & Teams Route"
Cohesion: 0.20
Nodes (5): RANK, ROLE_LABEL, ROLES, router, router

### Community 25 - "Config Validation & Logging"
Cohesion: 0.24
Nodes (7): ref_node_crypto, checkConfig(), PLACEHOLDER_SESSION_SECRETS, validateProductionConfig(), requestLogger(), longSecret, validKey

### Community 26 - "CI/CD Pipeline"
Cohesion: 0.28
Nodes (9): Lint, Test, and Build Job, Secret Scanning Job, CI Workflow, Build & Push Image Job, Build Frontend (CI check) Job, Deploy to Droplet Job, Deploy Workflow, Milestone A: Reliable Foundation (Complete) (+1 more)

### Community 27 - "Security Settings UI"
Cohesion: 0.22
Nodes (9): describeDevice(), formatDate(), SecuritySettings(), confirmSetup(), resendVerification(), revokeOthers(), revokeSession(), startSetup() (+1 more)

### Community 28 - "Landing Page"
Cohesion: 0.25
Nodes (7): BOARD_COLUMNS, FEATURES, Landing(), PREVIEW_ROWS, QUICK_ADD_CHIPS, QuickAddDemo(), sleep()

### Community 29 - "Roadmap Priorities Overview"
Cohesion: 0.25
Nodes (8): Readiness Healthcheck (/api/ready), GitHub App Integration Model, Extensible Integrations Framework, Milestone D: Planning and Scale, Priority 2: Production Config Hardening, Priority 5: GitHub App Integration, Priority 3: Auditability & Observability, Roadmap Purpose

### Community 30 - "Secret Encryption (AES-GCM)"
Cohesion: 0.39
Nodes (7): decryptBuffer(), decryptSecretValue(), encryptBuffer(), encryptSecretValue(), KEY, requireKey(), secretEncryptionConfigured()

### Community 31 - "Project Teams UI"
Cohesion: 0.25
Nodes (6): ProjectTeams(), addMember(), deleteTeam(), removeMember(), renameTeam(), submitNewTeam()

### Community 32 - "Docker Compose Deployment"
Cohesion: 0.38
Nodes (7): docker compose up -d --build Bootstrap, app Service (Node/Express Container), caddy Service (Automatic HTTPS), GitHub App Setup & Env Vars, Local Development Setup, Production Build (Docker), Punchlist App Overview

### Community 33 - "Transactional Email Sending"
Cohesion: 0.48
Nodes (5): APP_URL, escapeHtml(), sendInviteEmail(), sendPasswordResetEmail(), sendVerificationEmail()

### Community 34 - "Settings List UI"
Cohesion: 0.29
Nodes (3): SettingsList(), confirmReassignDelete(), tryDelete()

### Community 36 - "Sidebar Navigation UI"
Cohesion: 0.40
Nodes (3): Sidebar(), projectRow(), toggleFavorite()

### Community 37 - "Roles & Multi-Tenancy Docs"
Cohesion: 0.40
Nodes (5): Punchlist Multi-tenant Organization Model, Project Stakeholder Access, Organization Roles (Admin/Manager/Developer/Viewer), server/src/lib/permissions.js Reference, Roles: Owner/Admin/Manager/Developer/Viewer

### Community 38 - "Password Hashing & Credentials"
Cohesion: 0.40
Nodes (3): bcryptjs, hash, verifyCredentials()

### Community 39 - "Task Activity & Comments UI"
Cohesion: 0.40
Nodes (5): describe(), TaskActivity(), removeComment(), submitComment(), when()

### Community 40 - "SQLite Operating Model Docs"
Cohesion: 0.50
Nodes (4): Guarded Auto-run Migrations, SQLite Single-Writer Operating Model, Future PostgreSQL Path, Priority 4: Database & Operational Maturity

### Community 41 - "Dialog Host UI"
Cohesion: 0.67
Nodes (3): DialogHost(), resolve(), submit()

## Knowledge Gaps
- **155 isolated node(s):** `name`, `version`, `private`, `type`, `workspaces` (+150 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 245 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Frontend UI Components` to `Frontend Build Tooling`, `App Bootstrap & Error Handling`, `Landing Page`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `initials()` connect `Frontend UI Components` to `Task Modal & Attachments`, `Task Activity & Comments UI`, `Project Teams UI`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `colorForPerson()` connect `Frontend UI Components` to `Task Modal & Attachments`, `Task Activity & Comments UI`, `Project Teams UI`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _155 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06942983378918578 - nodes in this community are weakly interconnected._
- **Should `Server Dependencies & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `Frontend Build Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.05384615384615385 - nodes in this community are weakly interconnected._