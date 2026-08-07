-- A public signing URL is a bearer credential for exactly one person, not a
-- credential for every person listed on the agreement. Keep cue.share_token
-- as the client link for compatibility with links already shared, but make the
-- signing surface resolve the party token below.
ALTER TABLE cue_party ADD COLUMN IF NOT EXISTS share_token text;
CREATE UNIQUE INDEX IF NOT EXISTS cue_party_share_token_unique
  ON cue_party (share_token) WHERE share_token IS NOT NULL;

-- Extend the existing immutable-record trigger for the new credential. A
-- sent party's credential may be REVOKED (set to NULL — voiding revokes every
-- link) but never replaced with a different token. NULL → token remains
-- allowed as a one-time legacy backfill by this migration.
CREATE OR REPLACE FUNCTION cue_party_record_guard() RETURNS trigger AS $$
DECLARE
  cue_status text;
  target_cue_id bigint;
BEGIN
  target_cue_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.cue_id ELSE OLD.cue_id END;
  SELECT status INTO cue_status FROM cue WHERE id = target_cue_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF cue_status <> 'draft' THEN RAISE EXCEPTION 'parties cannot be added after send'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF cue_status IS NOT NULL AND cue_status <> 'draft' THEN RAISE EXCEPTION 'parties cannot be removed after send'; END IF;
    RETURN OLD;
  END IF;
  IF cue_status = 'draft' THEN
    IF NEW.cue_id IS DISTINCT FROM OLD.cue_id THEN RAISE EXCEPTION 'a party cannot move between Cues'; END IF;
    IF ROW(NEW.typed_name, NEW.signature_png, NEW.consent_at, NEW.signed_at, NEW.ip_hash, NEW.user_agent) IS DISTINCT FROM ROW(OLD.typed_name, OLD.signature_png, OLD.consent_at, OLD.signed_at, OLD.ip_hash, OLD.user_agent) THEN RAISE EXCEPTION 'a draft cannot carry signature evidence'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.cue_id, NEW.role, NEW.name, NEW.email, NEW.sort_order) IS DISTINCT FROM ROW(OLD.cue_id, OLD.role, OLD.name, OLD.email, OLD.sort_order) THEN RAISE EXCEPTION 'sent Cue parties are immutable'; END IF;
  IF OLD.share_token IS NOT NULL AND NEW.share_token IS NOT NULL AND NEW.share_token IS DISTINCT FROM OLD.share_token THEN RAISE EXCEPTION 'a sent Cue party signing link can be revoked but not replaced'; END IF;
  IF ROW(NEW.typed_name, NEW.signature_png, NEW.consent_at, NEW.signed_at, NEW.ip_hash, NEW.user_agent) IS DISTINCT FROM ROW(OLD.typed_name, OLD.signature_png, OLD.consent_at, OLD.signed_at, OLD.ip_hash, OLD.user_agent) THEN
    IF OLD.signed_at IS NOT NULL OR NEW.signed_at IS NULL OR NEW.consent_at IS NULL OR NEW.typed_name IS NULL THEN RAISE EXCEPTION 'signature evidence may be written exactly once'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill live sent Cues (c.share_token IS NOT NULL keeps voided and draft
-- Cues out). Clients keep their existing link; additional signers get a fresh
-- token minted here — sent Cues are frozen so there is no re-send, and the
-- creator copies these links from the share screen. Both updates are no-ops
-- on re-run because they only fill NULLs.
UPDATE cue_party p
   SET share_token = c.share_token
  FROM cue c
 WHERE p.cue_id = c.id
   AND p.role = 'client'
   AND c.share_token IS NOT NULL
   AND p.share_token IS NULL;

-- 16 bytes → 22 base64url chars, no padding: same shape as the app's tokens
-- (SHARE_TOKEN_BYTES in src/lib/cue.ts, base64url in cue-db.ts).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE cue_party p
   SET share_token = rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
  FROM cue c
 WHERE p.cue_id = c.id
   AND p.role = 'additional'
   AND c.share_token IS NOT NULL
   AND p.share_token IS NULL;
