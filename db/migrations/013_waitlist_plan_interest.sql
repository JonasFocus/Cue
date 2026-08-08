-- Which plan a signup came in through. The pricing CTAs now carry the plan
-- (?plan=pro#waitlist), and the launch email wants to sell Pro to the people
-- who already reached for it. Nullable: most signups arrive through the hero
-- and nav CTAs, which say nothing about a plan.
--
-- Safe to re-run, like every migration here.

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS plan_interest text;

-- Column is brand new, so every existing row is NULL and a plain ADD
-- CONSTRAINT cannot fail on data — no NOT VALID dance needed (contrast 004).
DO $$ BEGIN
  ALTER TABLE waitlist ADD CONSTRAINT waitlist_plan_interest_check
    CHECK (plan_interest IS NULL OR plan_interest IN ('free', 'pro', 'studio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
