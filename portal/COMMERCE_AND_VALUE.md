# Mirroried LED Commerce and Partner Value Rules

## Two separate environments

### Sponsor Partner Program
This is a contribution/value-exchange partnership. A business provides products, equipment, materials or services Mirroried LED needs for the truck, trailers, vans or mobile showrooms.

Flow:
`Offer contribution -> Mirroried LED acceptance -> accepted value -> sponsor placement allocation -> fulfillment/proof`

Rules:
- Offered value is not sponsor credit.
- Mirroried LED must approve the contribution and accepted value.
- Sponsor placement value may be equal to or less than accepted contribution value.
- The portal blocks sponsor placement allocation above the remaining accepted value.
- Cancelled sponsor placements release their allocated value.
- Sponsor Partner value is not a paid Advertising on the Go booking balance.

Example:
- Partner offers approved showroom products valued at $1,000.
- Mirroried LED accepts $1,000 in partnership value.
- Mirroried LED may allocate up to $1,000 total in sponsor placement value.
- A $1,001 total allocation is rejected.

## Advertising on the Go
This is paid event-based advertising.

Flow:
`Package -> Calendar -> Event -> Showroom 1 / Showroom 2 / both -> Reservation -> Checkout -> Campaign -> Creative approval -> Display -> Proof`

Payment rules:
- Paid packages create a `payment-pending` reservation.
- The portal does not store raw card or bank credentials.
- Until a payment processor is connected, the advertiser can request invoice/payment instructions.
- Staff records only verified payments actually received.
- Partial payments keep the booking `payment-pending`.
- Full verified payment changes the booking and reserved showroom selections to `confirmed`.
- Sponsor Partner contribution value cannot be used implicitly as Advertising on the Go payment.

## Current processor boundary
The database is provider-neutral and stores payment request/payment ledger records, references and verified amounts. No live card processor is connected in this release. A future Stripe, Square or other processor integration should use provider tokens/references and webhooks; raw payment credentials must never be written to these portal tables.
