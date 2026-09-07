BEGIN;

-- Sponsor Partner Program: contribution/value-exchange records.
-- Existing sponsor tables remain untouched for backward compatibility.
CREATE TABLE IF NOT EXISTS sponsor_contributions (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  contribution_type text NOT NULL CHECK (contribution_type IN ('product','equipment','material','service','other')),
  description text NOT NULL,
  accepted_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (accepted_value >= 0),
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','approved','received','rejected','closed')),
  received_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sponsor_contributions_sponsor_idx ON sponsor_contributions(sponsor_id);
CREATE INDEX IF NOT EXISTS sponsor_contributions_status_idx ON sponsor_contributions(status);

CREATE TABLE IF NOT EXISTS sponsor_placements (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  contribution_id text REFERENCES sponsor_contributions(id) ON DELETE SET NULL,
  name text NOT NULL,
  placement_type text NOT NULL,
  location_label text,
  agreed_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (agreed_value >= 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','fulfilled','expired','cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sponsor_placements_sponsor_idx ON sponsor_placements(sponsor_id);
CREATE INDEX IF NOT EXISTS sponsor_placements_contribution_idx ON sponsor_placements(contribution_id);

-- Business rule enforced by application/service layer:
-- total agreed sponsor placement value for a contribution may be equal to or less
-- than the accepted contribution value, but must not exceed it.

-- Advertising on the Go: paid advertising customers are NOT sponsor partners.
CREATE TABLE IF NOT EXISTS advertisers (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('prospect','active','paused','closed')),
  primary_contact text,
  email text,
  phone text,
  billing_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertisers_status_idx ON advertisers(status);
CREATE INDEX IF NOT EXISTS advertisers_email_idx ON advertisers(lower(email));

CREATE TABLE IF NOT EXISTS advertising_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  max_showrooms integer NOT NULL DEFAULT 1 CHECK (max_showrooms IN (1,2)),
  event_booking_limit integer CHECK (event_booking_limit IS NULL OR event_booking_limit > 0),
  campaign_upload_limit integer CHECK (campaign_upload_limit IS NULL OR campaign_upload_limit > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_packages_active_idx ON advertising_packages(active, sort_order);

CREATE TABLE IF NOT EXISTS showrooms (
  id text PRIMARY KEY,
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'trailer' CHECK (asset_type IN ('truck','trailer','van','showroom')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive','retired')),
  public_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS showrooms_status_idx ON showrooms(status);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  name text NOT NULL,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  venue text,
  city text,
  state_region text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','public','sold-out','cancelled','completed')),
  public_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events(event_date);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status, event_date);

CREATE TABLE IF NOT EXISTS event_showrooms (
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  showroom_id text NOT NULL REFERENCES showrooms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','limited','sold-out','unavailable','cancelled')),
  ad_slot_capacity integer CHECK (ad_slot_capacity IS NULL OR ad_slot_capacity >= 0),
  public_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, showroom_id)
);
CREATE INDEX IF NOT EXISTS event_showrooms_status_idx ON event_showrooms(event_id, status);

CREATE TABLE IF NOT EXISTS advertising_bookings (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  package_id text NOT NULL REFERENCES advertising_packages(id) ON DELETE RESTRICT,
  event_id text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','payment-pending','confirmed','cancelled','completed')),
  package_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (package_price >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_bookings_advertiser_idx ON advertising_bookings(advertiser_id);
CREATE INDEX IF NOT EXISTS advertising_bookings_event_idx ON advertising_bookings(event_id);
CREATE INDEX IF NOT EXISTS advertising_bookings_status_idx ON advertising_bookings(status);

CREATE TABLE IF NOT EXISTS advertising_booking_showrooms (
  booking_id text NOT NULL REFERENCES advertising_bookings(id) ON DELETE CASCADE,
  showroom_id text NOT NULL REFERENCES showrooms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','cancelled','fulfilled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, showroom_id)
);
CREATE INDEX IF NOT EXISTS advertising_booking_showrooms_showroom_idx ON advertising_booking_showrooms(showroom_id);

CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  booking_id text NOT NULL REFERENCES advertising_bookings(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','changes-requested','approved','scheduled','live','completed','cancelled')),
  creative_status text NOT NULL DEFAULT 'awaiting-upload' CHECK (creative_status IN ('awaiting-upload','submitted','changes-requested','approved','rejected')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_campaigns_advertiser_idx ON advertising_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS advertising_campaigns_booking_idx ON advertising_campaigns(booking_id);
CREATE INDEX IF NOT EXISTS advertising_campaigns_status_idx ON advertising_campaigns(status);

CREATE TABLE IF NOT EXISTS advertising_assets (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','archived')),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_assets_advertiser_idx ON advertising_assets(advertiser_id);
CREATE INDEX IF NOT EXISTS advertising_assets_campaign_idx ON advertising_assets(campaign_id);

CREATE TABLE IF NOT EXISTS advertising_proofs (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
  booking_id text NOT NULL REFERENCES advertising_bookings(id) ON DELETE CASCADE,
  showroom_id text REFERENCES showrooms(id) ON DELETE SET NULL,
  proof_type text NOT NULL,
  title text NOT NULL,
  url text,
  captured_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertising_proofs_advertiser_idx ON advertising_proofs(advertiser_id);
CREATE INDEX IF NOT EXISTS advertising_proofs_campaign_idx ON advertising_proofs(campaign_id);

COMMIT;
