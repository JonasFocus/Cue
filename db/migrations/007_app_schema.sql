-- The customer-facing application: studios, Cues, signing parties, audit events.
--
-- Until now the only account in the system was the seeded operator and the only
-- table anyone wrote to was `waitlist`. This migration opens Better Auth to
-- customer signup and gives those customers something to own.
--
-- Written to be safe to re-run, like every migration here. The `role` backfill
-- below is the one place where "idempotent" and "correct" pull apart, and it is
-- handled explicitly — read the comment before touching it.

-- ── Roles ──
-- /console was previously unreachable because nobody could sign up at all. With
-- signup open, that is no longer a guard, so the guard becomes this column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'role'
  ) THEN
    ALTER TABLE public."user" ADD COLUMN role text NOT NULL DEFAULT 'creator';

    -- Only inside the IF. Every account that exists at the instant this column
    -- is created predates customer signup, so it is the seeded operator. Run
    -- unconditionally, a re-run of this migration after the first customer
    -- signs up would promote every customer to operator and hand them the ops
    -- console. The guard is the whole point.
    UPDATE public."user" SET role = 'operator';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_check') THEN
    ALTER TABLE public."user"
      ADD CONSTRAINT user_role_check CHECK (role IN ('creator', 'operator'));
  END IF;
END $$;

-- ── Studio ──
-- One per account. Created on first sign-in rather than at signup so a failed
-- studio insert can never strand an account that Better Auth already made.
CREATE TABLE IF NOT EXISTS studio (
  id             bigserial PRIMARY KEY,
  owner_user_id  text        NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  legal_name     text,
  email          text,
  phone          text,
  address        text,
  -- Brand colour lands on the client-facing signing page. Hex only; the signing
  -- page interpolates it into a style attribute, so the shape is enforced here
  -- rather than trusted from a form.
  brand_color    text        CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$'),
  plan           text        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'studio')),
  -- Denormalised because the free allowance is five *total* sends, forever, so
  -- the alternative is counting every historical Cue on every page load.
  -- Incremented in the same transaction as the send.
  sent_count     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Cue ──
CREATE TABLE IF NOT EXISTS cue (
  id              bigserial PRIMARY KEY,
  studio_id       bigint      NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  -- A slug into src/lib/templates.ts, not a foreign key: system templates are
  -- code, so they version with the deploy. A sealed Cue does not care either
  -- way — its snapshot holds the rendered text, so a later template edit can
  -- never alter what somebody signed.
  template_slug   text        NOT NULL,
  title           text        NOT NULL,
  client_name     text        NOT NULL DEFAULT '',
  client_email    text,
  shoot_date      date,
  location        text,
  vars            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  omitted_clauses text[]      NOT NULL DEFAULT '{}',
  -- Internal only. Never rendered into the document or shown to a client, which
  -- is why it stays editable after sealing (see canEditField in src/lib/cue.ts).
  notes           text,
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'opened', 'partially_signed',
                                    'signed', 'voided', 'declined')),
  -- NULL until sent. UNIQUE rather than PRIMARY KEY so a draft has no link at
  -- all; Postgres allows many NULLs in a unique column.
  share_token     text        UNIQUE,
  -- Frozen at send: the rendered document exactly as the client will read it.
  -- Everything after this point reads the snapshot, never the template.
  snapshot        jsonb,
  doc_hash        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  opened_at       timestamptz,
  sealed_at       timestamptz
);

-- The workspace list is "this studio's Cues, newest first", optionally filtered
-- by status. One composite index serves both.
CREATE INDEX IF NOT EXISTS cue_studio_idx ON cue (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cue_studio_status_idx ON cue (studio_id, status, created_at DESC);

-- ── Parties ──
-- Everyone who signs. The client is created with the Cue; `additional` rows are
-- the extra signers a creator adds (a second partner, a parent, a company).
CREATE TABLE IF NOT EXISTS cue_party (
  id            bigserial PRIMARY KEY,
  cue_id        bigint      NOT NULL REFERENCES cue(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('client', 'creator', 'additional')),
  name          text        NOT NULL,
  email         text,
  sort_order    integer     NOT NULL DEFAULT 0,
  -- Signing evidence. All NULL until this party signs, all written together.
  typed_name    text,
  signature_png text,
  consent_at    timestamptz,
  signed_at     timestamptz,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cue_party_cue_idx ON cue_party (cue_id, sort_order, id);

-- ── Audit events ──
-- Append-only. This is the record the product promises, so "append-only" is
-- enforced by the database rather than by everyone remembering.
CREATE TABLE IF NOT EXISTS cue_event (
  id         bigserial PRIMARY KEY,
  cue_id     bigint      NOT NULL REFERENCES cue(id) ON DELETE CASCADE,
  party_id   bigint      REFERENCES cue_party(id) ON DELETE SET NULL,
  kind       text        NOT NULL,
  ip_hash    text,
  user_agent text,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cue_event_cue_idx ON cue_event (cue_id, created_at, id);

-- A trigger, not a revoked grant: the app connects as the owner `cue` role, so
-- REVOKE would not bind it. This does.
--
-- UPDATE only, deliberately. A row trigger also fires for rows removed by a
-- cascade, so covering DELETE here would make `DELETE FROM cue` raise for any
-- Cue that has ever been touched — and every Cue logs a `created` event the
-- moment it exists, so deleting a draft would be impossible.
--
-- The distinction that matters is preserved: an event disappearing along with
-- the Cue it describes is a record ending, while an event being *rewritten*
-- is history being edited, and that is what this refuses. Only drafts can be
-- deleted (see deleteCue in src/lib/cue-db.ts) — nothing a client has ever
-- seen can be removed this way.
CREATE OR REPLACE FUNCTION cue_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cue_event is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cue_event_no_rewrite ON cue_event;
CREATE TRIGGER cue_event_no_rewrite
  BEFORE UPDATE ON cue_event
  FOR EACH ROW EXECUTE FUNCTION cue_event_append_only();

-- ── updated_at ──
CREATE OR REPLACE FUNCTION cue_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cue_touch ON cue;
CREATE TRIGGER cue_touch BEFORE UPDATE ON cue
  FOR EACH ROW EXECUTE FUNCTION cue_touch_updated_at();

DROP TRIGGER IF EXISTS studio_touch ON studio;
CREATE TRIGGER studio_touch BEFORE UPDATE ON studio
  FOR EACH ROW EXECUTE FUNCTION cue_touch_updated_at();
