-- Operator changelog: the release notes rendered on the console's third tab.
-- Written to be safe to re-run.
--
-- No release date column on purpose. A release heads its group with the
-- timestamp of its newest entry (see groupReleases in src/lib/changelog.ts),
-- so adding a line never asks the operator to type a date.

CREATE TABLE IF NOT EXISTS changelog (
  id          bigserial   PRIMARY KEY,
  code        text        NOT NULL,
  version     text        NOT NULL,
  kind        text        NOT NULL,
  title       text        NOT NULL,
  -- Bare issue number, stored without the '#'. NULL when there is nothing to
  -- point at.
  ref         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Mirrors CHANGE_KINDS in src/lib/changelog.ts. Adding a kind means editing
-- that one list plus a migration, exactly like waitlist status.
DO $$ BEGIN
  ALTER TABLE changelog ADD CONSTRAINT changelog_kind_check
    CHECK (kind IN ('feature', 'fix', 'breaking'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Length bounds mirror src/lib/changelog.ts. The app rejects an over-long
-- field as 400 before it gets here; this is the backstop for anything that
-- writes to the table without going through the route.
DO $$ BEGIN
  ALTER TABLE changelog ADD CONSTRAINT changelog_text_check
    CHECK (length(code)    BETWEEN 1 AND 12
       AND length(version) BETWEEN 1 AND 20
       AND length(title)   BETWEEN 1 AND 160
       AND (ref IS NULL OR length(ref) BETWEEN 1 AND 12));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS changelog_created_at_idx ON changelog (created_at DESC);
