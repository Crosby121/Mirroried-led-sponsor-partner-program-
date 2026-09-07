# Mirroried LED Sponsor Partner Program

A complete operating system for building, selling, onboarding, delivering, and reporting sponsor partnerships for **Mirroried LED**.

## Program purpose
Mirroried LED sponsorships are structured as measurable marketing/business partnerships — not requests for free products. Each partnership must define what the sponsor contributes, what Mirroried LED delivers, how delivery is verified, and what is not guaranteed.

## Core operating rules
1. Lead with discovery before making an ask.
2. Identify the sponsor's goals, approval criteria, budget/in-kind capacity, timing, and decision process.
3. Define and value both sides of the partnership.
4. Promise only written, measurable deliverables that Mirroried LED can control.
5. Never promise unverified impressions, audience size, sales, conversions, or continuous exposure.
6. Separate confirmed deliverables from estimates and optional opportunities.
7. Use the sponsor portal for approved campaign visibility, asset status, proof-of-performance, and reporting.
8. Do not expose private fleet, customer, device, or operational data to sponsors.
9. No sponsor is active until scope, term, deliverables, approvals, and compensation are documented.
10. Every completed campaign receives a closeout report.

## Repository map
- `01-program/` — strategy, offer architecture, qualification rules
- `02-sales/` — call scripts, discovery, objections, closing process
- `03-packages/` — sponsor package framework and rate-card controls
- `04-agreements/` — agreement and statement-of-work templates
- `05-onboarding/` — sponsor intake, creative approvals, launch checklist
- `06-delivery-reporting/` — proof-of-performance and campaign reporting
- `07-portal/` — sponsor portal requirements, permissions, data model
- `08-operations/` — CRM pipeline, handoffs, renewal and offboarding
- `templates/` — outreach, proposal, recap, and follow-up templates
- `portal/` — deployable Sponsor Partner Portal application

## Sponsor Portal

Phase 2 is implemented in `portal/`.

The portal includes:
- session authentication;
- sponsor-specific tenant isolation;
- role-based access for sponsor viewers, sponsor approvers, sales, operations, and administrators;
- campaign and deliverable visibility;
- creative asset upload and approval decisions;
- proof-of-performance records;
- reports and renewal tracking;
- audit logging;
- mobile-responsive browser interface.

See `portal/README.md` for demo and production deployment instructions.

## Sales pipeline
`Target -> Contacted -> Discovery -> Qualified -> Proposal -> Negotiation -> Contracted -> Onboarding -> Active -> Reporting -> Renewal/Closed`

## Qualified sponsor definition
A sponsor is qualified when Mirroried LED has identified a real marketing objective, decision-maker or approval path, acceptable partnership type, realistic contribution, timeline, achievable deliverables, and legal/brand/category restrictions.

## Non-negotiable language rule
Do **not** say: “You will get X impressions,” “this will generate X sales,” or “your ad will be shown 24/7” unless the claim is verified and the agreement defines its measurement method.

Prefer: “We can guarantee the written placements, content, display windows, campaign dates, approved video integrations, and reporting items listed in the agreement.”

## Version
**2.0 — Sponsor Partner Program + deployable Sponsor Portal foundation**
