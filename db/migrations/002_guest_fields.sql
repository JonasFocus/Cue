-- Adds the fields the console guest list needs: a display name and a lifecycle
-- status. Applied by hand on staging on 2026-07-25 before this runner existed,
-- hence the IF NOT EXISTS guards and the catch around the constraint.

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; swallow the duplicate instead.
DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_status_check
    CHECK (status IN ('pending', 'invited', 'joined'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
