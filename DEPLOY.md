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
- `RESEND_API_KEY` / `EMAIL_FROM` = for emailing workspace invites (see below). Optional — invites
  still work without it, they just aren't emailed (the link is logged server-side instead).

**Setting up invite emails (optional but recommended):** create a free account at
[resend.com](https://resend.com), add your domain under Domains and verify it (Resend gives you a
few DNS records to add — TXT/MX for SPF and a TXT for DKIM; add those wherever your domain's DNS is
actually hosted, ask if you want help finding that), then create an API key under API Keys. Set
`RESEND_API_KEY` to that key and `EMAIL_FROM` to something on the verified domain, e.g.
`Punchlist <invites@yourdomain.com>`. Without a verified domain you can still use Resend's shared
`onboarding@resend.dev` sender, but it can only send to the email address on your own Resend account
— fine for testing, not for real invites.

Punchlist is multi-tenant: anyone who registers **without** an invite link founds their own
**organization** and becomes its owner — a fully separate tenant from every other organization on the
box, with no cross-visibility between them. `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` just provisions one
such owner account from env instead of through the Register screen, so you don't have to sign up by
hand on first boot.

Within one organization there's no predefined workspace, and only that org's owner can create one —
from the app itself, the same "create a workspace" screen anyone with zero workspaces sees, except a
non-owner just gets a waiting message there instead of a form. The owner assigns everyone else into a
workspace by inviting their email (Settings → Members, or centrally from the Admin screen) with
whatever role fits — **Admin** (manages members/settings), **Manager** (runs projects and task
assignment, no settings access), **Developer** (day-to-day contributor), or **Viewer** (read-only).
The Admin screen's Users tab is also where the owner deletes an account, sets someone's free-text team
label (e.g. "Backend", "QA", "Cloud"), and opens "Manage access" to add/remove/re-role a person across
every workspace in the org from one place, instead of hopping into each workspace's own Settings.

Registration is still open by default — anyone with the site URL can create a Punchlist account and
found their own organization. Joining an *existing* organization only happens via an invite link
(there's no "browse organizations and ask to join" flow). If you'd rather close public registration
entirely, that's a code change to `server/src/routes/auth.js` (e.g. gate `/register` behind an invite
code) — ask for it if you want it added.

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
