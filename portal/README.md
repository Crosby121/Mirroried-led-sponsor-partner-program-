# Mirroried LED Sponsor Portal

This folder contains the deployable Phase 2 Sponsor Partner Portal.

## What is included

- dependency-free Node.js HTTP server
- session-based authentication
- role-based authorization
- sponsor tenant isolation in API queries and uploaded creative files
- sponsor dashboard
- sales opportunity pipeline with won-deal handoff to a draft campaign
- campaigns and deliverables
- creative asset uploads
- sponsor creative approvals
- proof-of-performance records
- closeout report generation from fulfillment records
- reports and renewal records
- audit logging for material changes
- mobile-responsive browser interface

## Roles

- `sponsor_viewer`
- `sponsor_approver`
- `sales`
- `operations`
- `admin`

Sponsor roles are restricted to records whose `sponsorId` matches the authenticated user. Staff roles can work across sponsor records according to their permissions.

## Local demo

From the `portal` folder:

```bash
DEMO_MODE=true node server.js
```

Open `http://localhost:3000`.

Demo password: `demo`

Demo accounts:

- `approver@demo.mirroriedled.local`
- `viewer@demo.mirroriedled.local`
- `sales@demo.mirroriedled.local`
- `ops@demo.mirroriedled.local`
- `admin@demo.mirroriedled.local`

Demo mode is intentionally blocked when `NODE_ENV=production`.

## Production start

Set at minimum:

```bash
NODE_ENV=production
DEMO_MODE=false
ADMIN_EMAIL=admin@mirroriedled.com
ADMIN_PASSWORD=<long-random-password>
node server.js
```

The first production boot creates an administrator account if a non-demo account with that email does not already exist.

## Persistent storage

By default runtime data is written to:

- `portal/data/db.json`
- `portal/uploads/`

Both are ignored by Git. For production hosting, point these at persistent storage with:

- `DATA_FILE`
- `UPLOAD_DIR`

Back up both locations together.

## Reverse proxy / HTTPS

Production should be placed behind HTTPS. The server marks the session cookie `Secure` in production, so direct plain-HTTP production login is not supported by design.

Recommended public routing:

- `/` -> portal application
- `/api/*` -> same Node process
- `/uploads/*` -> same Node process; access requires an authenticated user with permission to view the asset's sponsor account

## Security rules

- Never enable `DEMO_MODE` in production.
- Never commit `.env`, `data/db.json`, or sponsor-uploaded files.
- Use a long random production admin password.
- Create individual user accounts; do not share staff credentials.
- Sponsor accounts must always have the correct `sponsorId`.
- Do not place device credentials, private fleet data, MQTT secrets, IP addresses, or unrelated customer information in sponsor-visible collections.
- Keep the portal behind TLS/HTTPS.

## API highlights

- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/opportunities`
- `POST /api/opportunities`
- `PATCH /api/opportunities/:id` — setting status to `won` creates the draft campaign handoff
- `GET /api/campaigns`
- `PATCH /api/campaigns/:id`
- `GET /api/deliverables`
- `PATCH /api/deliverables/:id`
- `GET /api/assets`
- `POST /api/assets`
- `GET /api/approvals`
- `PATCH /api/approvals/:id`
- `GET /api/proofs`
- `POST /api/proofs`
- `GET /api/reports`
- `POST /api/reports/generate`
- `GET /api/renewals`
- `GET /api/audit`
- `POST /api/users`
- `GET /api/health`

## Automated verification

`.github/workflows/portal-ci.yml` performs JavaScript syntax checks, starts the server in demo mode, checks the health endpoint, signs in through the real login route, and loads the sponsor dashboard.

## Current release boundary

This version is a deployable foundation. It intentionally uses a JSON datastore and local uploaded-file storage to keep the first deployment simple. Before large-scale multi-tenant use, migrate persistence to a transactional database and uploads to durable object storage while retaining the same tenant-isolation and role rules.
