BEGIN;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS checklist_fingerprint text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS checklist_generated_at timestamptz;
COMMIT;
