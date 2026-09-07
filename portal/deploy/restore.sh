#!/bin/sh
set -eu

if [ "${RESTORE_CONFIRM:-}" != "RESTORE" ]; then
  echo "Refusing restore. Set RESTORE_CONFIRM=RESTORE only after confirming the target backup and taking a current snapshot."
  exit 2
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: RESTORE_CONFIRM=RESTORE $0 <backup-directory>"
  exit 2
fi

COMPOSE_FILE="${COMPOSE_FILE:-portal/deploy/hostinger-compose.yml}"
SRC="$1"
DB_DUMP="$SRC/database.dump"
UPLOADS="$SRC/uploads.tar.gz"

[ -f "$DB_DUMP" ] || { echo "Missing $DB_DUMP"; exit 2; }
[ -f "$UPLOADS" ] || { echo "Missing $UPLOADS"; exit 2; }

if [ -f "$SRC/SHA256SUMS" ] && command -v sha256sum >/dev/null 2>&1; then
  (cd "$SRC" && sha256sum -c SHA256SUMS)
fi

echo "Restoring PostgreSQL database..."
cat "$DB_DUMP" | docker compose -f "$COMPOSE_FILE" exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "Restoring uploaded assets..."
docker compose -f "$COMPOSE_FILE" exec -T portal sh -c 'find /app/uploads -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
cat "$UPLOADS" | docker compose -f "$COMPOSE_FILE" exec -T portal sh -c 'tar -C /app/uploads -xzf -'

echo "Restarting portal..."
docker compose -f "$COMPOSE_FILE" restart portal

echo "Checking local application health..."
i=0
while [ "$i" -lt 30 ]; do
  if docker compose -f "$COMPOSE_FILE" exec -T portal wget -qO- http://127.0.0.1:3000/api/health | grep -q '"ok":true'; then
    echo "Restore completed and health check passed."
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "Restore completed but the portal health check did not pass. Keep public traffic disabled and investigate before retrying."
exit 1
