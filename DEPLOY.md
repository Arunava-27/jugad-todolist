# Deploying to DigitalOcean

These are the steps *you* run (they need your DO account, payment method, and DuckDNS account —
things I can't create on your behalf). Everything on the "type this" side is copy-pasteable.

## 1. Create the droplet

1. Sign in to DigitalOcean → **Create → Droplet**.
2. Image: **Ubuntu 24.04 LTS**.
3. Plan: **Basic → Regular → $6/mo** (1 GB RAM / 25 GB disk) is plenty for this app.
4. Authentication: SSH key (recommended) or password.
5. Create the droplet and note its **public IP address**.

## 2. Point a free domain at it (DuckDNS)

1. Go to https://www.duckdns.org, sign in (GitHub/Google/etc.), and create a subdomain, e.g. `arunava-todo`.
2. Set its IP to your droplet's public IP. You now have `arunava-todo.duckdns.org` → your server.
   (DuckDNS domains don't expire and are free forever; if your droplet's IP ever changes, update it there.)

## 3. Install Docker on the droplet

SSH in (`ssh root@<droplet-ip>`) and run:

```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
```

## 4. Copy the project to the droplet

From your own machine, in this project folder:

```bash
rsync -avz --exclude node_modules --exclude web/dist --exclude data ./ root@<droplet-ip>:/opt/jugad-todolist/
```

(No `rsync` on Windows? Use `scp -r . root@<droplet-ip>:/opt/jugad-todolist/` instead, or push the repo to a
private GitHub repo and `git clone` it on the droplet.)

## 5. Configure secrets

On the droplet:

```bash
cd /opt/jugad-todolist
cp .env.example .env
# generate a password hash locally or on the droplet (needs node + bcryptjs, or just run it via the app container later)
```

Edit `.env` and fill in:
- `DOMAIN` = the DuckDNS domain from step 2 (e.g. `arunava-todo.duckdns.org`)
- `ADMIN_EMAIL` / `ADMIN_NAME` = the seeded admin account's login and display name
- `ADMIN_PASSWORD_HASH` = output of `node scripts/hash-password.js "your-password"` (run this once
  locally where Node is installed, or `docker compose run --rm app node scripts/hash-password.js "your-password"`
  after step 6 below)
- `SESSION_SECRET` = any long random string

There's no predefined workspace — the admin account starts in zero workspaces (a normal state) and
creates its first one from the app itself, the same way any user does.

Registration is open by default — anyone with the site URL can create their own account (and gets
their own workspace). If you'd rather lock that down, that's a code change to `server/src/routes/auth.js`
(e.g. gate `/register` behind an invite code) — ask for it if you want it added.

## 6. Start everything

```bash
docker compose up -d --build
```

Caddy will automatically request a Let's Encrypt certificate for your DOMAIN the first time it's hit —
give it a minute, then visit `https://<your-domain>` and log in as the admin.

There's no predefined workspace — you'll land on a "create a workspace" screen the first time you sign
in. Create one before moving on to the next step.

## 7. Import your Notion backup once (optional)

The snapshot already pulled from Notion lives in `scripts/notion-export.json` (committed with the repo).
Only meaningful once at least one workspace exists (see step 6) — it imports into whichever workspace
it finds:

```bash
docker compose exec app node scripts/import-notion.js
```

This writes into the same `/data` volume the app uses, so your ~95 tasks and 4 projects show up the
next time you reload the site.

## 8. Updating later

```bash
cd /opt/jugad-todolist
# copy over new files (rsync/scp/git pull), then:
docker compose up -d --build
```

## Backups

The SQLite file and uploaded task images both live in the `app-data` Docker volume, at `/data/app.db`
and `/data/uploads/`. To copy them to your own machine:

```bash
docker compose cp app:/data/app.db ./app-backup-$(date +%F).db
docker compose cp app:/data/uploads ./uploads-backup-$(date +%F)
```

Run that from your laptop over SSH (or set up a cron job on the droplet) as often as you like — there's
no size or frequency limit beyond the droplet's own disk.
