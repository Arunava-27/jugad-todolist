# Punchlist

A self-hosted, Todoist-style task manager — no per-vendor storage/usage caps, because it runs on
your own server. Multi-tenant: registering without an invite founds your own organization (you
become its owner); real accounts, shared/collaborative workspaces per organization, and one admin
account seeded from env vars as its first owner. Includes a one-time backup/import of the Notion
"⚙️ Dev Tasks" + "📁 Projects" databases.

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) — `server/`
- **Frontend:** React + Vite SPA — `web/`
- **Data:** single SQLite file at `data/app.db`, uploaded task images at `data/uploads/`
- **Accounts:** open registration (email + password) — no invite founds a new organization, an
  invite joins an existing one. Each org's owner manages its users/workspaces from the Admin screen
  (roles, team labels, per-workspace access, delete); see `web/src/pages/Admin.jsx`
- **Roles:** Owner, Admin (members/settings), Manager (runs projects & task assignment), Developer
  (contributor), Viewer (read-only) — see `server/src/lib/permissions.js`
- **Workspaces:** shared/collaborative within one organization — projects, tasks, labels, people,
  and the status/priority workflow are all scoped per workspace. Only the org's owner creates a
  workspace; everyone else is added by invite (Settings → Members, or centrally from Admin)
- **Customization:** Settings screen — theme/accent color, editable statuses & priorities
  (drag to reorder, recolor, mark done/default), labels, people, and projects, all with colors
- **Hosting:** Docker Compose (`app` + Caddy for automatic HTTPS) — see [DEPLOY.md](DEPLOY.md)

## Local development

Requires Node 20+.

```bash
npm install                 # installs server + web workspaces
```

Copy `.env.example` to `.env` at the repo root and fill it in (loaded automatically — no need to
`$env:` export anything in your shell):

```bash
node scripts/hash-password.js "yourpassword"   # copy the printed hash into ADMIN_PASSWORD_HASH
```

```bash
npm run dev:server     # http://localhost:3000 (API)
```

The first time the server boots with `.env` filled in, it seeds the admin account and a default
workspace for them. Import the Notion backup into that workspace once the server has booted at
least once with admin env vars set:

```bash
npm run import-notion       # seeds data/app.db from scripts/notion-export.json into the admin's workspace
```

In a second terminal:

```bash
npm run dev:web         # http://localhost:5173 (UI, proxies /api to :3000)
```

Open http://localhost:5173 and either log in as the seeded admin, or use **Register** to create a
regular account (anyone with the URL can register — see [DEPLOY.md](DEPLOY.md) if you want to lock
that down later).

## Production build (what Docker runs)

```bash
npm run build:web       # builds web/dist
npm run start           # serves API + web/dist from one process on $PORT
```

## Deploying for real (DigitalOcean + Docker)

See [DEPLOY.md](DEPLOY.md) for the full step-by-step (droplet, DuckDNS domain, HTTPS, backups).

## Re-running the Notion import

`scripts/notion-export.json` is a point-in-time snapshot (this was a one-time backup, not live sync).
Re-running `npm run import-notion` is safe — it upserts by Notion URL within the admin's workspace,
so it won't duplicate rows.
