#!/bin/sh
set -eu

echo "Running database migrations..."
node db/migrate.js

echo "Ensuring production administrator exists..."
node db/bootstrap-admin.js

echo "Starting Mirroried LED Sponsor Portal..."
exec node production-server.js
