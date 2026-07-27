-- Operator audit trail: what we changed, on whose account, and when.
--
-- /console/studios is the first surface that lets an operator write to a
-- customer's row. Reading it deliberately leaves no trace — a page view is not
-- an event worth a row — but every mutation does, because otherwise a support
-- edit made by us is indistinguishable from one the studio made themselves, and
-- "who changed my plan?" has no answer.
--
-- Safe to re-run, like every migration here.

CREATE TABLE IF NOT EXISTS admin_event (
  id bigserial PRIMARY KEY,

  -- Deliberately NOT a foreign key, in either direction.
  --
  -- Towards public."user": an audit row has to outlive the account that wrote
  -- it. ON DELETE CASCADE would erase the trail with the operator, and SET NULL
  -- would make it forget who acted.
  --
  -- Towards studio / cue: a SET NULL cascade issues an UPDATE, and the
  -- append-only trigger at the bottom of this file refuses UPDATEs — so a
  -- foreign key here would make `DELETE FROM cue` raise for any draft an
  -- operator had ever touched. The identifiers are stored as the plain numbers
  -- they were at the time, which is what an audit trail wants anyway.
  operator_user_id text        NOT NULL,
  -- Denormalised so a row stays readable after the account behind it is gone.
  operator_email   text        NOT NULL,

  action           text        NOT NULL,
  target_studio_id bigint,
  target_cue_id    bigint,

  -- What changed. `plan.set` records from/to; a profile edit records only the
  -- *names* of the fields written, never their values — see the note above
  -- recordAdminEvent in src/lib/admin.ts. Nothing belonging to a studio's own
  -- clients is ever written here.
  meta             jsonb,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The studio detail page reads "recent operator actions on this account".
CREATE INDEX IF NOT EXISTS admin_event_studio_idx
  ON admin_event (target_studio_id, created_at DESC, id DESC);

-- Append-only, the same way cue_event is, and for the same reason: the app
-- connects as the owning `cue` role, so a REVOKE would not bind it. A trigger
-- does.
--
-- Unlike cue_event this covers DELETE as well. cue_event has to permit DELETE
-- because its rows legitimately disappear along with the Cue they describe.
-- Nothing cascades into admin_event — there are no foreign keys, see above — so
-- there is no legitimate delete to preserve here, and a log of operator actions
-- that operators can quietly remove is not a log.
CREATE OR REPLACE FUNCTION admin_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_event is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_event_no_rewrite ON admin_event;
CREATE TRIGGER admin_event_no_rewrite
  BEFORE UPDATE OR DELETE ON admin_event
  FOR EACH ROW EXECUTE FUNCTION admin_event_append_only();
