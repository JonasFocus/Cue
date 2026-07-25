-- Base waitlist table.
-- Written to be safe to re-run: this migration was applied by hand before the
-- migration runner existed, so it must be a no-op on the current database.

CREATE TABLE IF NOT EXISTS waitlist (
  id          bigserial PRIMARY KEY,
  email       text        NOT NULL UNIQUE,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist (created_at DESC);
