BEGIN;

-- Advertising on the Go customers authenticate through the same secure session
-- system while remaining separate from Sponsor Partner tenant records.
ALTER TABLE users ADD COLUMN IF NOT EXISTS advertiser_id text REFERENCES advertisers(id) ON DELETE RESTRICT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'sponsor_viewer','sponsor_approver',
      'advertiser_viewer','advertiser_approver',
      'sales','operations','admin'
    )
  );

ALTER TABLE users
  ADD CONSTRAINT users_tenant_check CHECK (
    (role IN ('sponsor_viewer','sponsor_approver') AND sponsor_id IS NOT NULL AND advertiser_id IS NULL)
    OR
    (role IN ('advertiser_viewer','advertiser_approver') AND advertiser_id IS NOT NULL AND sponsor_id IS NULL)
    OR
    (role IN ('sales','operations','admin') AND sponsor_id IS NULL AND advertiser_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS users_advertiser_idx ON users(advertiser_id);

COMMIT;
