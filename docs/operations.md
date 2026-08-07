# Operations and recovery

This runbook covers the production application at `cue.krevo.io`. It is a
human procedure by design: the repository cannot create provider resources,
change alert routes, or restore production safely.

## Ownership and response

The Cue operator is the incident owner. Until a second operator is named, that
is Jonas. The incident owner owns triage, customer communication, recovery
approval, and the written closeout.

1. Confirm the symptom from an independent browser or the uptime monitor.
2. Classify it: public outage, signing or record-integrity issue, suspected
   data exposure, or degraded dependency.
3. For a signing, integrity, or exposure concern, stop sending new links and
   preserve Vercel and Neon evidence before changing anything.
4. Use Vercel deployment and runtime logs to identify the failed release or
   dependency. Fix forward or revert the responsible application commit; do
   not run a destructive database action as a first response.
5. If data recovery is required, follow the restore drill below. A restored
   database is validation evidence, not a production cutover, until the owner
   explicitly approves it.
6. Record the timeline, impact, cause, recovery action, and follow-up work in
   `docs/private-changelog.md` after the incident.

## Required monitoring setup

These provider-side settings must be completed before broad access. They are
not configured by this repository.

| Signal | Configure | Alert condition | Owner action |
| --- | --- | --- | --- |
| Public uptime | An external HTTPS monitor against `https://cue.krevo.io/api/ping` every minute from at least two regions | non-200, timeout, or TLS failure for two consecutive checks | Start the response procedure above. |
| Application errors | A Vercel log drain or error-monitoring integration that includes production function exceptions | any new unhandled production exception, grouped and rate-limited | Triage the deployment and affected request path. |
| Database recovery | Neon PITR retention and restore access | retention falls below the agreed recovery window, or restore drill fails | Pause broad access until recovery is proven again. |

`/api/ping` intentionally reports process liveness only. It is public so an
external monitor can use it without a session; database and Redis status stay
operator-only at `/api/health`.

For each alert, route both the initial alert and an escalation after 15 minutes
to the incident owner. Test the route with the provider's test-alert feature
and record the date and destination in the private changelog. Do not put alert
webhooks, credentials, or recipient addresses in this repository.

## Quarterly restore drill

Run this at least quarterly and after any change to migrations or Neon recovery
configuration. The goal is to prove that the recovery point can be restored and
is usable without modifying production.

1. In Neon, verify the production project's PITR retention window and select a
   recovery time inside it. Create a **temporary branch or restore database**
   at that point. Never restore over production for a drill.
2. Retrieve the temporary branch's **direct, non-pooled** connection URL into a
   short-lived shell environment. Do not save it in `.env`, shell history, or
   the repository.
3. From the checkout that corresponds to the selected recovery point, run:

   ```bash
   RESTORE_DATABASE_URL='postgres://…' ./scripts/verify-restore.sh
   ```

   The verification is read-only. It checks the required record tables and
   requires restored migration history to exactly match the checkout. A failed
   match means select the matching application revision before treating the
   restore as valid.
4. Inspect the restored database read-only. Confirm a representative sealed Cue
   has its snapshot, document hash, signatures, and append-only events.
5. Record the recovery point, elapsed time, verifier result, any discrepancy,
   and the person who performed the drill in the private changelog. Remove the
   temporary Neon branch/database after evidence is recorded, following Neon
   retention requirements.

## Actual recovery

Treat actual recovery as an incident. First preserve the original production
database and relevant Vercel logs. Restore to a separate Neon branch, run the
verification above using the matching application revision, and compare the
needed records. Change a production connection only after the owner approves a
written recovery plan and a tested cutover/rollback plan. If the issue is a bad
migration, prefer a forward corrective migration when it preserves customer
records; do not rewrite migration files already applied to production.
