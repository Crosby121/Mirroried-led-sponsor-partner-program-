# Mirroried LED Sponsor Portal Specification

## Purpose
Give each sponsor a controlled view of its own campaigns, deliverables, approvals, proof-of-performance, and reports.

## Sponsor-facing modules
- Dashboard
- Active campaigns
- Deliverables/status
- Creative assets
- Approval requests
- Proof-of-performance
- Reports
- Billing/contract references
- Renewal opportunities
- Contact/support

## Required campaign fields
- Sponsor ID
- Campaign ID
- Campaign name
- Objective
- Start/end dates
- Status
- Contract/SOW reference
- Deliverables
- Inventory assignments
- Creative status
- Proof records
- Available metrics
- Make-goods/variances
- Renewal date/status

## Permissions
Sponsors can view only records explicitly linked to their sponsor account.

Sponsors must not receive access to:
- other sponsors or contracts;
- unrelated revenue/pricing records;
- private customer data;
- full fleet/device inventory;
- device credentials, IPs, tokens, MQTT secrets, or administrative controls;
- internal staff notes unless intentionally exposed;
- operational data unrelated to their contracted campaign.

## Roles
### Sponsor Viewer
Read campaign, proofs, reports, approved files.

### Sponsor Approver
Viewer permissions plus approval/rejection of assigned creative requests.

### Mirroried LED Sales
Manage opportunity, proposal, sponsor contacts and commercial handoff.

### Mirroried LED Operations
Manage contracted deliverables, activation, proofs, variances and reporting.

### Administrator
Full program administration.

## Status model
Opportunity: `target`, `contacted`, `discovery`, `qualified`, `proposal`, `negotiation`, `won`, `lost`, `nurture`

Campaign: `draft`, `awaiting-assets`, `awaiting-approval`, `scheduled`, `active`, `paused`, `completed`, `cancelled`

Deliverable: `planned`, `ready`, `active`, `fulfilled`, `exception`, `make-good`, `cancelled`

## Audit requirements
Record timestamp and actor for material changes including creative approvals, deliverable status, campaign dates, contract references, proof uploads, and make-goods.

## Dashboard priorities
Show sponsors:
1. what is active now;
2. what needs their approval;
3. what Mirroried LED has completed;
4. available proof and metrics;
5. upcoming campaign dates or renewal actions.

The portal is a fulfillment and reporting system, not a mechanism for exposing private Mirroried LED operational infrastructure.
