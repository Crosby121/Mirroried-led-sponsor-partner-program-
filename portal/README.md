# Mirroried LED Sponsor Portal

This folder contains the deployable Sponsor Partner Portal.

## Release modes

### Production — PostgreSQL
Use `production-server.js` through `npm start` or Docker Compose.

Production includes:
- PostgreSQL persistence
- database-backed sessions
- role-based authorization
- sponsor tenant isolation in every sponsor-facing query
- protected creative asset downloads
- opportunity → campaign handoff
- campaigns and deliverables
- creative approvals
- proof-of-performance
- closeout report generation
- renewals
- audit logging
- persistent uploaded-file volume
- rate-limited login
- secure production cookies
- origin validation when `APP_ORIGIN` is configured

### Demo/development — JSON
Use:

```bash
npm run start:demo
```

The JSON server remains intentionally separate so the lightweight demo cannot replace the PostgreSQL production datastore.

## Production deployment with Docker Compose

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Change every placeholder password in `.env`.

3. Set the public sponsor portal URL:

```env
APP_ORIGIN=https://sponsors.mirroriedled.com
```

4. Build and start:

```bash
docker compose up -d --build
```

The container startup sequence automatically:
1. waits for PostgreSQL through Compose health checks;
2. applies database migrations;
3. creates the first production administrator if needed;
4. starts the production portal.

5. Verify:

```bash
curl http://127.0.0.1:3000/api/health
```

Expected result includes `"ok":true` and `"database":"postgresql"`.

## Reverse proxy / HTTPS

The Compose stack binds the portal to loopback only by default:

```text
127.0.0.1:3000
```

Put a TLS reverse proxy in front of it and route the selected sponsor subdomain to port 3000.

Production session cookies are marked `Secure`, so the public portal must use HTTPS.

## Production environment

Required:

```env
NODE_ENV=production
APP_ORIGIN=https://sponsors.mirroriedled.com
DATABASE_URL=postgresql://...
ADMIN_EMAIL=admin@mirroriedled.com
ADMIN_PASSWORD=<long-random-password>
UPLOAD_DIR=/app/uploads
```

Docker Compose also uses:

```env
POSTGRES_DB=mirroried_portal
POSTGRES_USER=mirroried_portal
POSTGRES_PASSWORD=<strong-database-password>
```

## Database commands

Apply migrations:

```bash
npm run db:migrate
```

Create/verify the first administrator:

```bash
npm run db:bootstrap
```

Create a sponsor record before creating opportunities or sponsor users:

```bash
SPONSOR_NAME="Example Sponsor" \
SPONSOR_CONTACT="Marketing Manager" \
SPONSOR_EMAIL="marketing@example.com" \
SPONSOR_CATEGORY="Automotive" \
npm run db:create-sponsor
```

The command prints the sponsor ID. Use that ID for the sales opportunity and sponsor user account.

To choose a specific ID:

```bash
SPONSOR_ID="spn-example" SPONSOR_NAME="Example Sponsor" npm run db:create-sponsor
```

## Roles

- `sponsor_viewer`
- `sponsor_approver`
- `sales`
- `operations`
- `admin`

Sponsor users must have a `sponsorId`. Staff users must not have a `sponsorId`.

## Persistence and backups

Docker volumes:
- `postgres_data` — users, opportunities, campaigns, fulfillment, reporting, renewals, and audit records
- `portal_uploads` — sponsor creative uploads

Back up both together. A database backup without uploads, or uploads without matching database records, is incomplete.

## Security rules

- Never commit `.env`.
- Never use the demo server for production sponsor data.
- Keep PostgreSQL off the public internet.
- Keep the application behind HTTPS.
- Use unique staff accounts instead of shared credentials.
- Sponsor accounts must be assigned to the correct sponsor ID.
- Do not store device credentials, MQTT secrets, private fleet controls, unrelated customer data, or infrastructure credentials in sponsor-visible records.
- Uploaded creative files are served only through authenticated, sponsor-scoped API routes.
- Rotate administrator and database passwords when personnel or hosting access changes.

## Production API highlights

- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/dashboard`
- `GET/POST/PATCH /api/opportunities`
- `GET/PATCH /api/campaigns`
- `GET/PATCH /api/deliverables`
- `GET/POST /api/assets`
- `GET /api/assets/:id/file`
- `GET/PATCH /api/approvals`
- `GET/POST /api/proofs`
- `GET /api/reports`
- `POST /api/reports/generate`
- `GET /api/renewals`
- `GET /api/audit`
- `POST /api/users`
- `GET /api/health`

## Automated verification

`.github/workflows/portal-ci.yml` keeps validating the JSON demo build.

`.github/workflows/production-portal-ci.yml` provisions PostgreSQL and validates:
- dependency installation;
- JavaScript syntax;
- migrations;
- administrator bootstrap;
- production server startup;
- database health;
- login/session creation;
- authenticated `/api/me` and `/api/dashboard` access.

## Current release boundary

PostgreSQL is now the production datastore. Creative files remain on a protected persistent filesystem volume. For multi-server scaling, replace that volume with private object storage while retaining the authenticated asset route and sponsor-authorization checks.
