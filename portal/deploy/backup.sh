#!/bin/sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-portal/deploy/hostinger-compose.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"

mkdir -p "$DEST"
chmod 700 "$BACKUP_ROOT" "$DEST" 2>/dev/null || true

echo "Creating PostgreSQL backup..."
docker compose -f "$COMPOSE_FILE" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/database.dump"

echo "Creating uploads backup..."
docker compose -f "$COMPOSE_FILE" exec -T portal sh -c 'tar -C /app/uploads -czf - .' > "$DEST/uploads.tar.gz"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$DEST" && sha256sum database.dump uploads.tar.gz > SHA256SUMS)
fi

cat > "$DEST/MANIFEST.txt" <<EOF
Mirroried LED Sponsor Portal backup
Created UTC: $STAMP
Compose file: $COMPOSE_FILE
Contents:
- database.dump (PostgreSQL custom-format dump)
- uploads.tar.gz (creative/proof uploads)
- SHA256SUMS (when sha256sum is available)
EOF

echo "Backup complete: $DEST"
