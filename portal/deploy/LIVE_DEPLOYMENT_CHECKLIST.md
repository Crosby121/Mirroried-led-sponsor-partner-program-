# Live Sponsor Portal Deployment Checklist

Target production hostname: **https://sponsors.mirroriedled.com**

Use this checklist after the PostgreSQL production build and Hostinger deployment-config CI both pass.

## 1. Hostinger VPS readiness
- Use a Hostinger VPS with Docker/Docker Manager available.
- Confirm the VPS public IPv4 address.
- Confirm ports 80/443 are available to Hostinger's reverse proxy.
- Keep PostgreSQL private; do not publish port 5432.
- Take a VPS snapshot before first production deployment.

## 2. GitHub production deployment settings
In repository **Settings → Secrets and variables → Actions**, configure:

Secrets:
- `HOSTINGER_API_KEY`
- `PORTAL_POSTGRES_PASSWORD`
- `PORTAL_ADMIN_PASSWORD`

Variables:
- `HOSTINGER_VM_ID`
- `PORTAL_ADMIN_EMAIL`

The deployment workflow is `.github/workflows/deploy-hostinger.yml` and is manual-only.

## 3. Production source and environment
The Hostinger deployment uses `portal/deploy/hostinger-compose.yml`.

The workflow pins `PORTAL_GIT_REF` to the exact full Git commit SHA being deployed, then Docker builds only the `portal/` subdirectory from that commit.

Production application origin:

```text
https://sponsors.mirroriedled.com
```

Never commit production passwords or API keys.

## 4. Deploy from GitHub
Open **Actions → Deploy Sponsor Portal to Hostinger → Run workflow**.

Select `DEPLOY` only after all required secrets and variables exist.

Expected Hostinger Docker project name:

```text
mirroried-led-sponsor-portal
```

## 5. Hostinger project health
In hPanel → VPS → Docker Manager → Projects:
- project exists;
- `db` is healthy;
- `portal` is healthy;
- persistent volumes are attached;
- no PostgreSQL port is publicly published.

The portal container automatically runs migrations and administrator bootstrap before starting the production API.

## 6. DNS
Create an A record:

```text
Name: sponsors
Type: A
Target: <Hostinger VPS public IPv4>
```

Do not change the root `mirroriedled.com` record or the existing website records.

If Cloudflare is in front of DNS, keep the new sponsor record DNS-only until the first certificate is issued.

## 7. Attach the custom domain in Hostinger
In hPanel → VPS → Docker Manager → Projects → `mirroried-led-sponsor-portal` → Manage:
- assign `sponsors.mirroriedled.com` to the web/portal service;
- keep the container's internal application port at `3000`;
- apply/redeploy the project;
- allow Hostinger/Traefik to issue the Let's Encrypt certificate.

Do not attach the root domain to this Docker project.

## 8. Public health verification
After DNS and HTTPS are active:

```text
https://sponsors.mirroriedled.com/api/health
```

Require:
- HTTP 200;
- `ok: true`;
- PostgreSQL/database status healthy.

## 9. First administrator login
- Sign in with `PORTAL_ADMIN_EMAIL` and the production administrator password.
- Confirm the dashboard opens.
- Confirm logout invalidates the session.
- Confirm no demo account is available.

## 10. First sponsor provisioning
Create the sponsor record from the Hostinger portal container terminal:

```bash
SPONSOR_NAME="Sponsor Company" \
SPONSOR_CONTACT="Marketing Contact" \
SPONSOR_EMAIL="contact@example.com" \
SPONSOR_CATEGORY="Category" \
npm run db:create-sponsor
```

Record the returned sponsor ID.

## 11. Sponsor user
Create an individual `sponsor_viewer` or `sponsor_approver` account tied to the exact sponsor ID. Never reuse one sponsor identity for another sponsor.

## 12. Isolation acceptance test
Before launch, verify:
- Sponsor A sees Sponsor A records.
- Sponsor A cannot open Sponsor B campaign data.
- Sponsor A cannot open Sponsor B asset URL.
- sponsor viewers cannot approve creative.
- sponsor approvers can approve only their own sponsor's assigned creative.
- staff roles work according to their permissions.

## 13. Sales-to-operations acceptance test
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

## 14. Backups
Before entering real sponsor data:
- enable VPS snapshots/backups;
- back up PostgreSQL;
- back up the `portal_uploads` volume;
- perform and document a restore test.

## 15. Rollback
If public verification fails:
- remove/disable the `sponsors` DNS record or domain route;
- keep the existing Mirroried LED website unchanged;
- restore the previous Docker project configuration or VPS snapshot;
- verify the production database before retrying.

## 16. Go-live gate
Go live only when:
- production CI is green;
- Hostinger deployment-config CI is green;
- remote Git Docker build is green;
- both production containers are healthy;
- `/api/health` is green over HTTPS;
- production passwords are set;
- sponsor isolation tests pass;
- backup/restore is verified;
- no demo credentials or demo mode are enabled.
