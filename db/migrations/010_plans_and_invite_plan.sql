-- Two changes to the plan vocabulary.
--
-- 1. `creator` becomes `pro`.
--
--    A product decision — the tier is called Pro now — but it also removes a
--    real collision. `creator` meant three different things in this schema:
--    a user's role (creator vs operator, migration 007), a signing party's role
--    (client / creator / additional), and a paid tier. Two of those live in the
--    same query more often than is comfortable, and 009's backfill filters on
--    `u.role = 'creator'` a few lines from a column that also accepted
--    'creator'. One of the three now reads unambiguously.
--
--    Safe now in a way it will not be later: there are no rows on a paid tier
--    yet, so the UPDATE below is a no-op in production and this is the cheapest
--    this rename will ever be. Once somebody is paying, renaming an enum value
--    means coordinating with Stripe.
--
-- 2. An invite carries the plan the studio starts on.
--
--    Applied once, when the studio is created (see ensureStudio in
--    src/lib/studio.ts, which reads it in the INSERT). Changing an invite's plan
--    afterwards does not move an existing studio: at that point the studio's own
--    plan is the truth and /console/studios/[id] is where it is changed. The
--    console only offers the control while the invite is unaccepted, so the two
--    cannot silently disagree.
--
-- Safe to re-run, like every migration here.

-- ── studio.plan: creator -> pro ──
-- The constraint is dropped before the UPDATE and rebuilt after, because the
-- old one rejects 'pro' and the new one rejects 'creator' — there is no order
-- that works with both in place.
DO $$
DECLARE
  con text;
BEGIN
  SELECT conname INTO con
    FROM pg_constraint
   WHERE conrelid = 'studio'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%plan%';

  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE studio DROP CONSTRAINT %I', con);
  END IF;
END $$;

UPDATE studio SET plan = 'pro' WHERE plan = 'creator';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'studio'::regclass AND conname = 'studio_plan_check'
  ) THEN
    ALTER TABLE studio
      ADD CONSTRAINT studio_plan_check CHECK (plan IN ('free', 'pro', 'studio'));
  END IF;
END $$;

-- ── invite.plan ──
-- Defaults to 'free', which is what every invite issued before this column
-- existed implicitly promised.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invite' AND column_name = 'plan'
  ) THEN
    ALTER TABLE invite ADD COLUMN plan text NOT NULL DEFAULT 'free';
  END IF;
END $$;

-- Named to match studio_plan_check, and holding the same vocabulary. An invite
-- that could provision a plan the studio table refuses would be a 500 at the
-- moment somebody accepts it — which is the worst possible moment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'invite'::regclass AND conname = 'invite_plan_check'
  ) THEN
    ALTER TABLE invite
      ADD CONSTRAINT invite_plan_check CHECK (plan IN ('free', 'pro', 'studio'));
  END IF;
END $$;
