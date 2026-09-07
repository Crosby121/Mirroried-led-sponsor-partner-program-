# Mirroried LED Marketing Environments

Mirroried LED operates two related but distinct marketing environments. They may share infrastructure, events, creative review, proof-of-delivery tooling, and reporting, but they must not be modeled as the same commercial relationship.

## 1. Sponsor Partner Program

Purpose: help equip, maintain, and present Mirroried LED's truck, trailers, vans, showrooms, fabrication operation, and related showcase assets through approved business partnerships.

### Value exchange

A Sponsor Partner may provide products, equipment, materials, services, or other approved resources that Mirroried LED actually needs.

Mirroried LED records the accepted contribution value and provides a written sponsor benefit with a value equal to or less than that accepted contribution value.

Example:

- Accepted partner contribution: $1,000 in needed products.
- Maximum agreed sponsor-placement value: $1,000.
- The agreement may provide less than $1,000 in sponsor placement depending on the negotiated partnership.

### Typical sponsor fulfillment

- inside-showroom sponsor placement;
- sponsor-branded mirror or display;
- approved product showcase placement;
- agreed logo/brand recognition;
- event or digital deliverables only when specifically written into the partnership agreement.

Sponsor Partners are not ordinary advertising customers and should not be forced through a paid advertising checkout flow.

### Data that should be tracked

- partner account;
- contribution description;
- contribution type;
- accepted contribution value;
- date received/accepted;
- sponsor-credit ceiling;
- written sponsor placements;
- placement value;
- fulfillment status;
- proof records;
- renewal/continuation decision.

## 2. Advertising on the Go

Purpose: sell event-based advertising inventory to paying businesses through the Mirroried LED client portal.

### Customer journey

1. Create advertising account.
2. Select/purchase an advertising package tier.
3. View approved event calendar.
4. Select an event/date.
5. View which Mirroried LED showrooms are scheduled and bookable for that event.
6. Select Showroom 1, Showroom 2, or both when allowed by the purchased tier and inventory.
7. Upload the event-specific advertising campaign.
8. Mirroried LED reviews/approves creative.
9. Campaign is scheduled.
10. Campaign is displayed while the selected showroom(s) are set up at the approved event.
11. Mirroried LED records proof of delivery and closes out the campaign.

### Advertising data that should be tracked

- advertiser account;
- advertising package/tier;
- payment/order status;
- approved public event;
- event date;
- showroom availability;
- selected showroom(s);
- campaign creative;
- creative approval status;
- scheduled display period;
- fulfillment/proof records;
- invoice/payment records;
- package usage/remaining rights where applicable.

## 3. Shared infrastructure

The two environments may share:

- authentication infrastructure;
- organization/contact records;
- approved event records;
- showroom/network asset records;
- creative storage;
- approval tooling;
- proof-of-delivery storage;
- audit logging;
- reporting framework.

They should not share the same commercial account type or value model.

## 4. Privacy boundary

External users may see only information approved for their account and program.

Do not expose:

- private fleet routes;
- unapproved travel schedules;
- vehicle/device controls;
- MQTT/device credentials;
- infrastructure credentials;
- unrelated customer or partner information;
- internal operating notes.

Advertising customers should see only approved bookable event dates and showroom availability needed to purchase and schedule their campaign.

## 5. Required production database evolution

The current production schema was originally built around a sponsor-only tenant model (`sponsors`, `sponsor_id`, `sponsor_viewer`, `sponsor_approver`). Before the full Advertising on the Go booking workflow is considered production-complete, the backend should be evolved so advertisers are not represented as sponsors.

Recommended separation:

- `sponsor_partners`
- `sponsor_contributions`
- `sponsor_placements`
- `advertisers`
- `advertising_packages`
- `events`
- `showrooms`
- `event_showrooms`
- `advertising_bookings`
- `advertising_campaigns`
- shared creative/proof/audit resources scoped to the correct environment

The existing sponsor production data should be preserved during migration.
