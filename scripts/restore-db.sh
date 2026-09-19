#!/bin/sh
# Restores a database backup produced by backup-db.sh. DESTRUCTIVE — replaces
# the live app.db. Meant for real disaster recovery, or for a restore drill
# against a disposable environment (a scratch copy of docker-compose.yml
# pointed at a throwaway volume/DATA_DIR) — never point this at production
# unless recovering from an actual incident.
set -eu

BACKUP_FILE="${1:?Usage: restore-db.sh <path-to-backup.db>}"
[ -f "$BACKUP_FILE" ] || { echo "Not found: $BACKUP_FILE" >&2; exit 1; }

cd "$(dirname "$0")/.."

echo "Stopping app..."
docker compose stop app

echo "Restoring $BACKUP_FILE -> app:/data/app.db ..."
docker compose cp "$BACKUP_FILE" app:/data/app.db

echo "Starting app..."
docker compose start app
sleep 3
docker compose ps app
