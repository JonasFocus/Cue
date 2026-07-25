-- Moves the invariants the app was enforcing on its own into the database,
-- which is the only layer every writer passes through. joinWaitlist normalises
-- email to lowercase, but a hand-run INSERT or a CSV import does not, and
-- `waitlist_email_key UNIQUE (email)` is case-sensitive — so 'Jonas@x.com'
-- could sit beside 'jonas@x.com', breaking dedupe and the "never reveal
-- whether an address is on the list" property that the ON CONFLICT relies on.
--
-- ponytail: a plain unique index, not CONCURRENTLY. scripts/migrate.sh wraps
-- each file in BEGIN/COMMIT and CREATE INDEX CONCURRENTLY cannot run in a
-- transaction; the table is in the hundreds of rows, so the brief write lock
-- is free. Revisit only if this table ever gets large.

-- Fold any existing case-variant duplicates into the oldest row first,
-- otherwise the unique index cannot be built.
DELETE FROM waitlist a
 USING waitlist b
 WHERE lower(a.email) = lower(b.email)
   AND a.id > b.id;

UPDATE waitlist SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_key ON waitlist (lower(email));

-- Length and shape checks. Deliberately loose: an address is only truly
-- validated by delivering to it, and these exist to stop junk and unbounded
-- writes, not to adjudicate RFC 5322. Mirrors src/lib/waitlist.ts.
DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_email_check
    CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254
           AND email ~ '^[^[:space:]@]+@[^[:space:]@,]+\.[a-z]{2,}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_name_check
    CHECK (name IS NULL OR length(name) BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_user_agent_check
    CHECK (user_agent IS NULL OR length(user_agent) <= 255);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
