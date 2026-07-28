-- Invite-only access to the customer application.
--
-- /app/signup was open to anybody who found it. Cue is pre-launch and the
-- people being let in are a handful of invited testers, so the guard moves from
-- "nobody knows the URL" to a row in this table: an account can only be created
-- for an email that holds a live invite, and an account whose invite has ended
-- stops being able to reach the workspace at all.
--
-- One invite per email address, deliberately. "Invite Ana twice" is a question
-- with no good answer — which window applies? — so the unique constraint makes
-- it unrepresentable and the console edits the existing row instead.
--
-- Safe to re-run, like every migration here. The backfill at the bottom is the
-- one place where "idempotent" and "correct" pull apart, and it is handled
-- explicitly — read its comment before touching it.

CREATE TABLE IF NOT EXISTS invite (
  id          bigserial PRIMARY KEY,

  -- Lower-cased on the way in and enforced here, because this column is the
  -- join to public."user".email for every access decision. `Ana@x.com` and
  -- `ana@x.com` are one inbox; they must not be two invites with two different
  -- access windows.
  email       text        NOT NULL UNIQUE CHECK (email = lower(email)),
  name        text        NOT NULL,

  -- The invite link. A bearer credential in the same sense cue.share_token is —
  -- holding it is what gets somebody to a signup form — so it is generated the
  -- same way, from randomBytes, and it is unique so a collision would be a
  -- constraint violation rather than a silent hijack of someone else's invite.
  token       text        NOT NULL UNIQUE,

  -- The access period. A NULL expires_at means "no end date": that is what the
  -- backfill below gives every account that predates invites, and what the
  -- console leaves an invite on when it should simply not lapse.
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,

  -- Access withdrawn by hand. Deliberately a separate column from the period
  -- rather than "set expires_at = now()": restoring an invite then gives back
  -- exactly the window it had, and the period stays a statement of intent
  -- instead of a field that quietly records an unrelated event.
  revoked_at  timestamptz,

  -- Stamped the first time the invited account reaches the workspace. Not a
  -- gate — the email is what binds an account to an invite, since Better Auth
  -- owns the signup transaction and cannot hand us the token afterwards. This
  -- is the answer to "did they ever actually turn up", which is the whole
  -- reason to send an invite.
  accepted_user_id text   REFERENCES public."user"(id) ON DELETE SET NULL,
  accepted_at      timestamptz,

  -- Denormalised text, not a foreign key: it stays readable after the operator
  -- account behind it is gone, the same call admin_event makes.
  invited_by  text,
  note        text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invite_period_check CHECK (expires_at IS NULL OR expires_at > starts_at)
);

-- The console lists newest first; the access gate looks up by email, which the
-- UNIQUE constraint above already indexes.
CREATE INDEX IF NOT EXISTS invite_created_idx ON invite (created_at DESC, id DESC);

DROP TRIGGER IF EXISTS invite_touch ON invite;
CREATE TRIGGER invite_touch BEFORE UPDATE ON invite
  FOR EACH ROW EXECUTE FUNCTION cue_touch_updated_at();

-- ── Backfill ──
--
-- Every creator account that exists at the moment this table appears was made
-- through the open signup this migration closes. Locking those people out would
-- be a data-loss event dressed up as a security improvement, so each one gets an
-- accepted invite with no end date — exactly the access they already have.
--
-- ON CONFLICT DO NOTHING, not a bare INSERT: on a re-run the rows are already
-- there, and on the vanishingly unlikely chance two accounts differ only by the
-- case of their email, the first one wins rather than the whole migration
-- aborting. Operators are skipped — /console gates on the `role` column and
-- never consults this table.
--
-- gen_random_uuid() rather than the app's randomBytes: these tokens address
-- links nobody will ever open, and 128 bits from the server's CSPRNG is more
-- than enough to keep the UNIQUE constraint honest without pulling in pgcrypto.
INSERT INTO invite (email, name, token, starts_at, accepted_user_id, accepted_at, invited_by, note)
SELECT lower(u.email),
       COALESCE(NULLIF(trim(u.name), ''), split_part(u.email, '@', 1)),
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       u."createdAt",
       u.id,
       u."createdAt",
       'migration 009',
       'Signed up before invites existed.'
  FROM public."user" u
 WHERE u.role = 'creator'
ON CONFLICT (email) DO NOTHING;
