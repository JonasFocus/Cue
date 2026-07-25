-- Replaces the signup-funnel vocabulary (pending/invited/joined) with the
-- moderation one the console now works in.
--
-- 'invited' and 'joined' both meant "we let this person in", so both collapse
-- to 'approved'. That loses the distinction between invited-but-not-signed-up
-- and actually-signed-up; nothing reads it today, and when accounts exist that
-- fact will live on the user record rather than on the waitlist row.

ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_status_check;

UPDATE waitlist SET status = 'approved' WHERE status IN ('invited', 'joined');

ALTER TABLE waitlist
  ADD CONSTRAINT waitlist_status_check
  CHECK (status IN ('pending', 'screening', 'approved', 'suspended', 'blacklisted'));
