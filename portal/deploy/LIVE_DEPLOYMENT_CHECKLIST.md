# Live Sponsor Portal Deployment Checklist

Use this checklist after the PostgreSQL production build passes CI.

## 1. Hosting
- Provision a Linux host with Docker Engine and Docker Compose.
- Restrict SSH access.
- Confirm ports 80/443 are available for the reverse proxy.
- Keep PostgreSQL private; do not expose port 5432 publicly.

## 2. Repository
- Clone `Crosby121/Mirroried-led-sponsor-partner-program-`.
- Enter `portal/`.
- Copy `.env.example` to `.env`.

## 3. Secrets
Replace every placeholder before startup:
- `POSTGRES_PASSWORD`
- `ADMIN_PASSWORD`
- any hosting/reverse-proxy credentials

Never commit `.env`.

## 4. Public address
Set:

```env
APP_ORIGIN=https://sponsors.mirroriedled.com
```

Create DNS for the selected sponsor portal hostname and point it at the deployment host.

## 5. Start

```bash
docker compose up -d --build
```

The app container applies migrations and bootstraps the administrator automatically.

## 6. Local health verification

```bash
curl http://127.0.0.1:3000/api/health
```

Require `ok: true` and `database: postgresql` before configuring public traffic.

## 7. TLS reverse proxy
- Terminate HTTPS at the reverse proxy.
- Proxy the sponsor hostname to `127.0.0.1:3000`.
- Redirect HTTP to HTTPS.
- Do not proxy PostgreSQL publicly.

## 8. First administrator login
- Sign in with `ADMIN_EMAIL` and the production administrator password.
- Confirm the dashboard opens.
- Confirm logout invalidates the session.

## 9. First sponsor provisioning
Create the sponsor record:

```bash
SPONSOR_NAME="Sponsor Company" \
SPONSOR_CONTACT="Marketing Contact" \
SPONSOR_EMAIL="contact@example.com" \
SPONSOR_CATEGORY="Category" \
docker compose exec portal npm run db:create-sponsor
```

Record the returned sponsor ID.

## 10. Sponsor user
Create an individual `sponsor_viewer` or `sponsor_approver` account tied to the exact sponsor ID. Never reuse one sponsor account for another sponsor.

## 11. Isolation acceptance test
Before launch, verify:
- Sponsor A sees Sponsor A records.
- Sponsor A cannot open Sponsor B campaign data.
- Sponsor A cannot open Sponsor B asset URL.
- sponsor viewers cannot approve creative.
- sponsor approvers can approve only their own sponsor's assigned creative.
- staff roles work according to their permissions.

## 12. Sales-to-operations acceptance test
Verify this complete flow:
1. create opportunity;
2. mark opportunity won;
3. confirm draft campaign is created;
4. add/activate deliverables;
5. upload creative;
6. approve creative;
7. add proof records;
8. generate closeout report;
9. confirm renewal record/process.

## 13. Backup requirement
Before entering real sponsor data, configure backups for both:
- PostgreSQL volume/database;
- `portal_uploads` volume.

A backup is not considered valid until a restore test has been completed.

## 14. Go-live gate
Go live only when:
- production CI is green;
- Docker image build is green;
- `/api/health` is green;
- HTTPS is valid;
- production passwords are changed;
- sponsor isolation tests pass;
- backup/restore is verified;
- no demo credentials or demo mode are enabled.
