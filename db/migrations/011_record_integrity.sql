-- Make the signed-record promises database invariants rather than application
-- conventions. Safe to re-run.

CREATE OR REPLACE FUNCTION cue_record_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only draft Cues may be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('sent', 'voided')) OR
    (OLD.status = 'sent' AND NEW.status IN ('opened', 'partially_signed', 'signed', 'voided', 'declined')) OR
    (OLD.status = 'opened' AND NEW.status IN ('partially_signed', 'signed', 'voided', 'declined')) OR
    (OLD.status = 'partially_signed' AND NEW.status IN ('signed', 'voided', 'declined'))
  ) THEN
    RAISE EXCEPTION 'invalid Cue transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'sent' AND (
    NEW.share_token IS NULL OR NEW.snapshot IS NULL OR NEW.doc_hash IS NULL OR NEW.sent_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a sent Cue requires its frozen record and share token';
  END IF;

  IF NEW.status = 'signed' AND (
    NEW.sealed_at IS NULL OR EXISTS (
      SELECT 1 FROM cue_party WHERE cue_id = NEW.id AND signed_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'a signed Cue requires a seal and every signature';
  END IF;

  IF OLD.status <> 'draft' AND ROW(
    NEW.studio_id, NEW.template_slug, NEW.title, NEW.client_name,
    NEW.client_email, NEW.shoot_date, NEW.location, NEW.vars,
    NEW.omitted_clauses, NEW.snapshot, NEW.doc_hash, NEW.sent_at
  ) IS DISTINCT FROM ROW(
    OLD.studio_id, OLD.template_slug, OLD.title, OLD.client_name,
    OLD.client_email, OLD.shoot_date, OLD.location, OLD.vars,
    OLD.omitted_clauses, OLD.snapshot, OLD.doc_hash, OLD.sent_at
  ) THEN
    RAISE EXCEPTION 'sent Cue content is immutable';
  END IF;

  IF OLD.status <> 'draft' AND NEW.share_token IS DISTINCT FROM OLD.share_token AND NOT (
    NEW.status = 'voided' AND NEW.share_token IS NULL
  ) THEN
    RAISE EXCEPTION 'a live share token can only be cleared by voiding';
  END IF;

  IF OLD.opened_at IS NOT NULL AND NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'opened_at is immutable once written';
  END IF;

  IF OLD.sealed_at IS NOT NULL AND NEW.sealed_at IS DISTINCT FROM OLD.sealed_at THEN
    RAISE EXCEPTION 'sealed_at is immutable once written';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cue_record_no_rewrite ON cue;
CREATE TRIGGER cue_record_no_rewrite
  BEFORE UPDATE OR DELETE ON cue
  FOR EACH ROW EXECUTE FUNCTION cue_record_guard();

CREATE OR REPLACE FUNCTION cue_party_record_guard() RETURNS trigger AS $$
DECLARE
  cue_status text;
  target_cue_id bigint;
BEGIN
  target_cue_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.cue_id ELSE OLD.cue_id END;
  SELECT status INTO cue_status FROM cue WHERE id = target_cue_id FOR UPDATE;

  IF TG_OP = 'INSERT' THEN
    IF cue_status <> 'draft' THEN
      RAISE EXCEPTION 'parties cannot be added after send';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A NULL status occurs only during a permitted cascade from deleting a draft.
    IF cue_status IS NOT NULL AND cue_status <> 'draft' THEN
      RAISE EXCEPTION 'parties cannot be removed after send';
    END IF;
    RETURN OLD;
  END IF;

  IF cue_status = 'draft' THEN
    IF NEW.cue_id IS DISTINCT FROM OLD.cue_id THEN
      RAISE EXCEPTION 'a party cannot move between Cues';
    END IF;
    IF ROW(NEW.typed_name, NEW.signature_png, NEW.consent_at, NEW.signed_at,
           NEW.ip_hash, NEW.user_agent) IS DISTINCT FROM
       ROW(OLD.typed_name, OLD.signature_png, OLD.consent_at, OLD.signed_at,
           OLD.ip_hash, OLD.user_agent) THEN
      RAISE EXCEPTION 'a draft cannot carry signature evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.cue_id, NEW.role, NEW.name, NEW.email, NEW.sort_order) IS DISTINCT FROM
     ROW(OLD.cue_id, OLD.role, OLD.name, OLD.email, OLD.sort_order) THEN
    RAISE EXCEPTION 'sent Cue parties are immutable';
  END IF;

  IF OLD.signed_at IS NOT NULL OR NEW.signed_at IS NULL OR NEW.consent_at IS NULL OR
     NEW.typed_name IS NULL THEN
    RAISE EXCEPTION 'signature evidence may be written exactly once';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cue_party_record_no_rewrite ON cue_party;
CREATE TRIGGER cue_party_record_no_rewrite
  BEFORE INSERT OR UPDATE OR DELETE ON cue_party
  FOR EACH ROW EXECUTE FUNCTION cue_party_record_guard();

-- Draft deletion removes its audit rows explicitly in deleteCue(). Signed Cues
-- are never deletable, so their event rows can refuse both rewrite operations.
ALTER TABLE cue_event DROP CONSTRAINT IF EXISTS cue_event_cue_id_fkey;
ALTER TABLE cue_event
  ADD CONSTRAINT cue_event_cue_id_fkey
  FOREIGN KEY (cue_id) REFERENCES cue(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION cue_event_append_only() RETURNS trigger AS $$
DECLARE
  cue_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO cue_status FROM cue WHERE id = OLD.cue_id;
    IF cue_status = 'draft' THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'cue_event is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cue_event_no_rewrite ON cue_event;
CREATE TRIGGER cue_event_no_rewrite
  BEFORE UPDATE OR DELETE ON cue_event
  FOR EACH ROW EXECUTE FUNCTION cue_event_append_only();
