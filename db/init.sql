-- Cue schema. Runs once, on first boot of an empty Postgres volume.
-- Better Auth owns its own tables and creates them via `better-auth migrate`.

CREATE TABLE IF NOT EXISTS waitlist (
  id          bigserial PRIMARY KEY,
  email       text        NOT NULL UNIQUE,
  name        text,
  -- pending → invited → joined. Free text with a check rather than an enum, so
  -- adding a stage later is a one-line change instead of a type migration.
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'invited', 'joined')),
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The console reads "signups today" and orders the guest list newest-first.
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist (created_at DESC);
