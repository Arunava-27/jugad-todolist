# Jugad Todolist

A self-hosted, Todoist-style task manager — no per-vendor storage/usage caps, because it runs on
your own server. Includes a one-time backup/import of the Notion "⚙️ Dev Tasks" + "📁 Projects"
databases.

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) — `server/`
- **Frontend:** React + Vite SPA — `web/`
- **Data:** single SQLite file at `data/app.db`
- **Auth:** one hardcoded admin user (env vars), session cookie
- **Hosting:** Docker Compose (`app` + Caddy for automatic HTTPS) — see [DEPLOY.md](DEPLOY.md)

## Local development

Requires Node 20+.

```bash
npm install                 # installs server + web workspaces
npm run import-notion       # one-time: seeds data/app.db from scripts/notion-export.json
```

Create `server/.env`-equivalent env vars for local dev (or just export them in your shell):

```bash
node scripts/hash-password.js "yourpassword"   # copy the printed hash
```

```bash
# Windows PowerShell
$env:ADMIN_USERNAME="arunava"
$env:ADMIN_PASSWORD_HASH="<hash from above>"
$env:SESSION_SECRET="dev-secret"
npm run dev:server     # http://localhost:3000 (API)
```

In a second terminal:

```bash
npm run dev:web         # http://localhost:5173 (UI, proxies /api to :3000)
```

Open http://localhost:5173, log in with the username/password you hashed above.

## Production build (what Docker runs)

```bash
npm run build:web       # builds web/dist
npm run start           # serves API + web/dist from one process on $PORT
```

## Deploying for real (DigitalOcean + Docker)

See [DEPLOY.md](DEPLOY.md) for the full step-by-step (droplet, DuckDNS domain, HTTPS, backups).

## Re-running the Notion import

`scripts/notion-export.json` is a point-in-time snapshot (this was a one-time backup, not live sync).
Re-running `npm run import-notion` is safe — it upserts by Notion URL, so it won't duplicate rows.
