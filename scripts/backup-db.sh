#!/bin/sh
# Backs up the production SQLite database (and uploaded files/secret files)
# out of the app-data Docker volume. Meant to run ON THE DROPLET, from the
# repo root (/opt/jugad-todolist) where docker-compose.yml lives — by hand,
# or on a schedule (see DEPLOY.md's Backups section for the cron line).
#
# Deliberately never touches .env / SECRET_MASTER_KEY: an encrypted secrets
# backup only stays encrypted as long as the decryption key travels
# separately from it. Never bundle this backup directory with a copy of .env.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)

# Checkpoint the WAL into the main file first. SQLite's WAL mode (which this
# app runs in) keeps recent writes in a separate -wal file — a plain
# `docker compose cp` of app.db alone can silently return a stale/incomplete
# snapshot if that file isn't merged in first (this has actually happened
# once before during a manual backup earlier in this project's history).
docker compose exec -T -w /app/server app node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/data/app.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
"

docker compose cp app:/data/app.db "$BACKUP_DIR/app-$TS.db"
docker compose cp app:/data/uploads "$BACKUP_DIR/uploads-$TS" 2>/dev/null || true
docker compose cp app:/data/secrets "$BACKUP_DIR/secrets-$TS" 2>/dev/null || true

# Retention: the database dump is small and cheap — keep 14 days of daily
# snapshots. Uploaded files/secret files are heavier, keep fewer (3).
find "$BACKUP_DIR" -maxdepth 1 -name 'app-*.db' -mtime +14 -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*' -mtime +3 -exec rm -rf {} +
find "$BACKUP_DIR" -maxdepth 1 -name 'secrets-*' -mtime +3 -exec rm -rf {} +

SIZE=$(du -h "$BACKUP_DIR/app-$TS.db" | cut -f1)
DISK_USE=$(df -P / | tail -1 | awk '{print $5}' | tr -d '%')
echo "[backup] $(date -Iseconds) wrote $BACKUP_DIR/app-$TS.db ($SIZE), disk at ${DISK_USE}%"
if [ "$DISK_USE" -ge 85 ]; then
  echo "[backup] WARNING: disk usage at ${DISK_USE}% — investigate before it fills up" >&2
fi
