BEGIN;

CREATE TABLE IF NOT EXISTS sponsors (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('prospect','active','paused','closed')),
  primary_contact text,
  email text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('sponsor_viewer','sponsor_approver','sales','operations','admin')),
  sponsor_id text REFERENCES sponsors(id) ON DELETE RESTRICT,
  salt text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role IN ('sponsor_viewer','sponsor_approver') AND sponsor_id IS NOT NULL) OR (role IN ('sales','operations','admin') AND sponsor_id IS NULL))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  name text NOT NULL,
  objective text,
  estimated_value numeric(12,2) NOT NULL DEFAULT 0,
  decision_maker text,
  next_step text,
  status text NOT NULL DEFAULT 'target' CHECK (status IN ('target','contacted','discovery','qualified','proposal','negotiation','won','lost','nurture')),
  campaign_id text,
  owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities(status);
CREATE INDEX IF NOT EXISTS opportunities_sponsor_idx ON opportunities(sponsor_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL,
  name text NOT NULL,
  objective text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting-assets','awaiting-approval','scheduled','active','paused','completed','cancelled')),
  contract_ref text,
  creative_status text,
  renewal_date date,
  renewal_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_sponsor_idx ON campaigns(sponsor_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_campaign_fk;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deliverables (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','active','fulfilled','exception','make-good','cancelled')),
  planned_start date,
  planned_end date,
  inventory_assignment text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliverables_sponsor_idx ON deliverables(sponsor_id);
CREATE INDEX IF NOT EXISTS deliverables_campaign_idx ON deliverables(campaign_id);

CREATE TABLE IF NOT EXISTS assets (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','archived')),
  uploaded_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_sponsor_idx ON assets(sponsor_id);
CREATE INDEX IF NOT EXISTS assets_campaign_idx ON assets(campaign_id);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_id text REFERENCES assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decided_by text REFERENCES users(id) ON DELETE SET NULL,
  comment text
);
CREATE INDEX IF NOT EXISTS approvals_sponsor_idx ON approvals(sponsor_id);
CREATE INDEX IF NOT EXISTS approvals_campaign_idx ON approvals(campaign_id);

CREATE TABLE IF NOT EXISTS proofs (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  deliverable_id text REFERENCES deliverables(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  url text,
  captured_at timestamptz NOT NULL,
  notes text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proofs_sponsor_idx ON proofs(sponsor_id);
CREATE INDEX IF NOT EXISTS proofs_campaign_idx ON proofs(campaign_id);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  period_start date,
  period_end date,
  summary text NOT NULL,
  generated_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_sponsor_idx ON reports(sponsor_id);
CREATE INDEX IF NOT EXISTS reports_campaign_idx ON reports(campaign_id);

CREATE TABLE IF NOT EXISTS renewals (
  id text PRIMARY KEY,
  sponsor_id text NOT NULL REFERENCES sponsors(id) ON DELETE RESTRICT,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started','review','proposal','negotiation','renewed','closed')),
  target_date date,
  owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS renewals_sponsor_idx ON renewals(sponsor_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
