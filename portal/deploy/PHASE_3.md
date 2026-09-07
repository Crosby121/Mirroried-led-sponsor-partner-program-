# Phase 3 — Live Sponsor Portal Deployment

This phase begins after the PostgreSQL production build is green.

## Goal
Deploy the Sponsor Partner Portal to a real HTTPS hostname without changing or exposing the existing Mirroried LED live portal.

## Scope
- choose/confirm production host
- deploy `portal/compose.yml`
- create production `.env` outside Git
- configure PostgreSQL and persistent volumes
- configure sponsor portal DNS
- configure HTTPS reverse proxy
- verify `/api/health`
- verify administrator login/logout
- create first real sponsor record
- create first sponsor user
- run cross-sponsor isolation acceptance tests
- run opportunity → campaign → fulfillment → report test
- establish database + upload backups
- perform restore test
- document rollback procedure

## Go-live rule
Do not send sponsor traffic to the portal until every item in `LIVE_DEPLOYMENT_CHECKLIST.md` passes.

## Existing live site protection
The Sponsor Partner Portal should use a dedicated hostname/subdomain and reverse-proxy route so the current Mirroried LED storefront/live portal remains untouched during deployment.
