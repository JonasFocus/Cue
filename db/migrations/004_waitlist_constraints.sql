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
--
-- Added NOT VALID, then validated separately below. A plain ADD CONSTRAINT
-- scans every existing row, and one legacy address that fails the regex — from
-- a CSV import, or a data-only restore run before the migrations — raises
-- check_violation, which the duplicate_object handler does not catch. That
-- propagates out of the file, out of migrate.sh's ON_ERROR_STOP, and aborts the
-- whole deploy on a schema change that was never about existing data.
-- NOT VALID enforces the constraint on every future INSERT and UPDATE and
-- never touches the rows already there, so this step cannot fail on data.
DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_email_check
    CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254
           AND email ~ '^[^[:space:]@]+@[^[:space:]@,]+\.[a-z]{2,}$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_name_check
    CHECK (name IS NULL OR length(name) BETWEEN 1 AND 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_user_agent_check
    CHECK (user_agent IS NULL OR length(user_agent) <= 255) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Now backfill-validate. On clean data each of these promotes the constraint to
-- fully valid and the end state is identical to a plain ADD CONSTRAINT. On
-- dirty data the offending constraint stays NOT VALID and the deploy survives
-- with a loud warning: new writes are still checked, the old rows just are not.
-- Fix them and re-run ALTER TABLE waitlist VALIDATE CONSTRAINT <name>.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'waitlist_email_check', 'waitlist_name_check', 'waitlist_user_agent_check'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE waitlist VALIDATE CONSTRAINT %I', c);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING '% left NOT VALID: existing rows violate it. New writes are still checked; clean the rows, then VALIDATE CONSTRAINT.', c;
    END;
  END LOOP;
END $$;
