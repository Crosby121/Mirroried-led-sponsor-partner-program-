BEGIN;

-- Sponsor Partner Program: distinguish the partner's offered value from the value
-- Mirroried LED formally accepts. Existing records are backfilled conservatively.
ALTER TABLE sponsor_contributions
  ADD COLUMN IF NOT EXISTS offered_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (offered_value >= 0);
ALTER TABLE sponsor_contributions
  ADD COLUMN IF NOT EXISTS approved_by_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sponsor_contributions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE sponsor_contributions
SET offered_value = accepted_value
WHERE offered_value = 0 AND accepted_value > 0;

-- Advertising on the Go checkout ledger. This intentionally does not store raw
-- card or bank credentials. A payment processor can later write provider IDs
-- into these records without changing booking/account semantics.
CREATE TABLE IF NOT EXISTS advertising_payment_requests (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  booking_id text NOT NULL REFERENCES advertising_bookings(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'invoice' CHECK (request_type IN ('invoice','payment-link','other')),
  amount_due numeric(12,2) NOT NULL CHECK (amount_due > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','issued','partially-paid','paid','cancelled')),
  external_reference text,
  due_date date,
  notes text,
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_payment_requests_advertiser_idx ON advertising_payment_requests(advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS advertising_payment_requests_booking_idx ON advertising_payment_requests(booking_id, status);

CREATE TABLE IF NOT EXISTS advertising_payments (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  booking_id text NOT NULL REFERENCES advertising_bookings(id) ON DELETE CASCADE,
  payment_request_id text REFERENCES advertising_payment_requests(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('invoice','card','ach','check','cash','other')),
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','refunded','voided')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_payments_advertiser_idx ON advertising_payments(advertiser_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS advertising_payments_booking_idx ON advertising_payments(booking_id, status);

COMMIT;
