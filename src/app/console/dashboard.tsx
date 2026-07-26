"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  Check,
  ChevronDown,
  CircleAlert,
  CornerDownLeft,
  Ellipsis,
  LogOut,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ServiceHealth } from "@/lib/docker";
import type { Guest, WaitlistStats } from "@/lib/db";
import type { Probe } from "@/app/api/health/route";
import { GUEST_STATUSES, type GuestStatus } from "@/lib/waitlist";
import {
  STATUS_SELECT_INITIAL,
  statusSelectStep,
  statusSelectValue,
  type StatusSelectEvent,
} from "@/lib/console";
import {
  CHANGE_KINDS,
  entryStamp,
  groupReleases,
  MAX_CODE,
  MAX_REF,
  MAX_TITLE,
  MAX_VERSION,
  type ChangeEntry,
  type ChangeFields,
  type ChangeKind,
} from "@/lib/changelog";
import { CueMark } from "@/components/cue-mark";

/* Built from the server's own types rather than hand-copied. A local copy
   drifted once already — it kept declaring `today` and `latest` after the API
   stopped sending them, and TypeScript could not see the lie because the fetch
   response is `any`. Fields stay optional because a non-200 (a 502 through the
   deploy window, say) still parses into this shape. */
type Snapshot = {
  generatedAt: string;
  containers?: ServiceHealth[];
  probes?: { postgres?: Probe; redis?: Probe };
  waitlist?: WaitlistStats;
};

const POLL_MS = 5000;

export function Dashboard({ operator }: { operator: string }) {
  const [tab, setTab] = useState<"overview" | "guests" | "changelog">("overview");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [guests, setGuests] = useState<Guest[] | null>(null);
  // The API caps the list; when it does, the count on screen is not the total.
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  // Refreshed on each poll, not on a clock: it only feeds a relative-time
  // tooltip, and a 1 Hz tick re-rendered every row and every select for it.
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);
  // A poll that lands mid-edit would overwrite the optimistic value with the
  // pre-edit one. Hold guest updates while a mutation is outstanding.
  const mutating = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [health, list] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/waitlist", { cache: "no-store" }),
      ]);
      if (health.status === 401 || list.status === 401) {
        window.location.href = "/console/login";
        return;
      }
      // Read the two responses independently. A failed health check used to
      // throw before the guest list was parsed, silently discarding it.
      // `truncated` is additive and may be absent on older responses.
      const payload: { guests?: Guest[]; truncated?: boolean } | null = list.ok
        ? await list.json().catch(() => null)
        : null;
      if (payload?.guests && mutating.current === 0) {
        setGuests(payload.guests);
        setTruncated(payload.truncated === true);
      }

      const body: Snapshot | null = await health.json().catch(() => null);
      // A failed health check is a state to render, not an error to throw:
      // throwing here used to discard the guest list fetched alongside it.
      if (health.ok && body) {
        setSnap(body);
        setDegraded(null);
      } else {
        setSnap(body?.containers || body?.probes ? body : null);
        setDegraded(`health check returned ${health.status}`);
      }

      setNow(Date.now());
      if (!list.ok) throw new Error(`guest list returned ${list.status}`);
      setError(null);
    } catch (err) {
      setError(
        `Lost contact with the API — ${(err as Error).message}. Retrying every ${POLL_MS / 1000}s.`,
      );
    } finally {
      inFlight.current = false;
    }
  }, []);

  const setStatus = useCallback(async (id: number, status: GuestStatus) => {
    mutating.current += 1;
    setGuests((prev) =>
      prev ? prev.map((g) => (g.id === id ? { ...g, status } : g)) : prev,
    );
    try {
      const res = await fetch("/api/waitlist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(`status update returned ${res.status}`);
      const { guest } = await res.json();
      setGuests((prev) => (prev ? prev.map((g) => (g.id === id ? guest : g)) : prev));
      setError(null);
    } catch (err) {
      setError(`${(err as Error).message} — reverting`);
      void load();
    } finally {
      mutating.current -= 1;
    }
  }, [load]);

  // Better Auth rejects a body-less POST with 415 and never revokes the
  // session. Without the header the operator was redirected to the login page
  // while the session cookie stayed valid for its full life — on a shared
  // machine, that is a live session handed to the next person.
  const signOut = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`sign-out returned ${res.status}`);
    } catch (err) {
      setError(
        `Sign-out failed (${(err as Error).message}) — you are STILL signed in. Try again.`,
      );
      return;
    }
    window.location.href = "/console/login";
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  return (
    <div className="cx">
      <div className="cx-col" data-tab={tab}>
        <header className="cx-top">
          <span className="cx-mark">
            <CueMark size={13} />
          </span>
          <span className="cx-wordmark">
            Console<span>staging.cue.krevo.io</span>
          </span>
          <span className="cx-who">{operator}</span>
          <button
            className="cx-signout"
            onClick={signOut}
            type="button"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={13} strokeWidth={2} />
          </button>
        </header>

        {/* Plain toggle buttons, not an ARIA tablist: the pattern would need
            roving tabIndex, arrow keys and real tabpanels to be honest, and it
            buys nothing over two buttons that announce their pressed state. */}
        <nav className="cx-tabs" aria-label="Console views">
          <button
            type="button"
            aria-pressed={tab === "overview"}
            className="cx-tab"
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            aria-pressed={tab === "guests"}
            className="cx-tab"
            onClick={() => setTab("guests")}
          >
            Guest list
            {guests ? <b>{truncated ? `${guests.length}+` : guests.length}</b> : null}
          </button>
          <button
            type="button"
            aria-pressed={tab === "changelog"}
            className="cx-tab"
            onClick={() => setTab("changelog")}
          >
            Changelog
          </button>
        </nav>

        {/* One region, always in the DOM, contents swapped. A `role="status"`
            that mounts alongside its own text is announced unreliably: the
            region has to exist before the change for AT to notice it. */}
        <div className="cx-live" role="status" aria-live="polite">
          {error && <div className="cx-error">{error}</div>}

          {degraded && (
            <div className="cx-degraded">
              Health reporting is degraded — {degraded}. The guest list below is
              unaffected. Retrying every {POLL_MS / 1000}s.
            </div>
          )}
        </div>

        <main>
          {tab === "overview" && <Overview snap={snap} degraded={degraded} />}
          {tab === "guests" && (
            <GuestList
              guests={guests}
              truncated={truncated}
              now={now}
              onStatus={setStatus}
            />
          )}
          {tab === "changelog" && <Changelog />}
        </main>
      </div>
    </div>
  );
}

/* ── Overview ── */

function Overview({ snap, degraded }: { snap: Snapshot | null; degraded: string | null }) {
  const containers = snap?.containers ?? [];
  const running = containers.filter((c) => c.state === "running").length;
  const total = containers.length;
  const storesOk = (snap?.probes?.postgres?.ok ?? false) && (snap?.probes?.redis?.ok ?? false);
  const allUp = !degraded && total > 0 && running === total && storesOk;
  const memory = containers.reduce((a, c) => a + c.memoryUsedMb, 0);

  return (
    <div className="cx-pane">
      <section className="cx-hero">
        <div className="cx-hero-art cx-art" aria-hidden>
          <div className="cx-dither" />
        </div>
        <div className="cx-hero-body">
          <span
            className={`cx-hero-status ${degraded ? "cx-warn" : !snap ? "cx-idle" : allUp ? "cx-ok" : "cx-warn"}`}
          >
            <span className="cx-dot" />
            {degraded
              ? "Degraded"
              : !snap
                ? "Connecting"
                : allUp
                  ? "All systems operational"
                  : "Degraded"}
          </span>

          <h1 className="cx-hero-title">
            {degraded
              ? "Health reporting is degraded."
              : !snap
                ? "Reading the box…"
                : allUp
                  ? "Everything is running."
                  : "Something needs a look."}
          </h1>
          <p className="cx-hero-sub">
            {degraded
              ? `${degraded}. Only partial health data is available — the guest list is still live.`
              : snap
                ? `${running} of ${total} services up, Postgres and Redis answering, and the waitlist is open.`
                : "Fetching container health and datastore probes."}
          </p>

          <div className="cx-figures">
            <span className="cx-figure">
              <b>{snap ? `${running}/${total}` : "—"}</b>
              <span>services</span>
            </span>
            <span className="cx-figure">
              <b>{snap?.waitlist ? snap.waitlist.total.toLocaleString() : "—"}</b>
              <span>on the waitlist</span>
            </span>
            <span className="cx-figure">
              <b>{snap?.waitlist ? `+${snap.waitlist.week}` : "—"}</b>
              <span>this week</span>
            </span>
            <span className="cx-figure">
              <b>{snap ? memory : "—"}</b>
              <span>MB in use</span>
            </span>
          </div>
        </div>
      </section>

      <p className="cx-label">Services</p>
      <div className="cx-list">
        {!containers.length &&
          Array.from({ length: 5 }, (_, i) => <div className="cx-skeleton" key={i} />)}

        {containers.map((c, i) => (
          <div className="cx-row" key={c.key} style={{ animationDelay: `${i * 45}ms` }}>
            <span className={c.state === "running" ? "cx-ok" : "cx-bad"}>
              <span className="cx-dot" />
            </span>
            <span className="cx-row-name">{c.name}</span>
            <span className="cx-row-note">{c.role}</span>
            <span className="cx-row-num">{formatUptime(c.uptimeSeconds)}</span>
          </div>
        ))}
      </div>

      <p className="cx-label">Datastores</p>
      <div className="cx-list">
        <ProbeRow name="postgres" hint="SELECT version()" probe={snap?.probes?.postgres} />
        <ProbeRow name="redis" hint="PING" probe={snap?.probes?.redis} />
      </div>

      <p className="cx-note">
        Polling every {POLL_MS / 1000} seconds. Container stats come through a read-only
        Docker socket proxy, never the socket itself.
      </p>
    </div>
  );
}

function ProbeRow({
  name,
  hint,
  probe,
}: {
  name: string;
  hint: string;
  probe?: Probe;
}) {
  return (
    <div className="cx-row">
      <span className={!probe ? "cx-idle" : probe.ok ? "cx-ok" : "cx-bad"}>
        <span className="cx-dot" />
      </span>
      <span className="cx-row-name">{name}</span>
      <span className="cx-row-note">{hint}</span>
      <span className="cx-row-num">
        {probe && probe.latencyMs >= 0 ? `${probe.latencyMs} ms` : "—"}
      </span>
    </div>
  );
}

/* ── Guest list ── */

const STATUS_LABEL: Record<GuestStatus, string> = {
  pending: "Pending",
  screening: "Screening",
  approved: "Approved",
  suspended: "Suspended",
  blacklisted: "Blacklisted",
};

function GuestList({
  guests,
  truncated,
  now,
  onStatus,
}: {
  guests: Guest[] | null;
  truncated: boolean;
  now: number;
  onStatus: (id: number, status: GuestStatus) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!guests) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(needle) || g.email.toLowerCase().includes(needle),
    );
  }, [guests, q]);

  return (
    <div className="cx-pane">
      <div className="cx-guests">
        <div className="cx-guests-art cx-art" aria-hidden>
          <div className="cx-dither" data-tone="cool" />
        </div>

        <header className="cx-guests-head">
          <h1>Guest list</h1>
          <p>
            {!guests?.length
              ? "Everyone who asked to be told when Cue opens up."
              : truncated
                ? `Showing the ${guests.length} most recent — there are more waiting than fit in one page.`
                : `${guests.length} ${guests.length === 1 ? "person is" : "people are"} waiting to hear from you.`}
          </p>

          <label className="cx-search">
            <Search size={13} strokeWidth={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search the guest list"
            />
          </label>
        </header>

        {/* A real table. The fixed 4-column layout comes from `display:
            contents` on thead/tbody/tr — but Blink drops the implicit row and
            cell roles the moment their display is not table-row/table-cell, so
            every role here is spelled out. Verified in the a11y tree: without
            them the whole table collapses to `table > generic`. */}
        <table className="cx-table">
          {/* Column headers over an empty table label nothing — hide them. */}
          {!!filtered?.length && (
            <thead className="cx-thead" role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Name
                </th>
                <th scope="col" role="columnheader">
                  Email
                </th>
                <th scope="col" role="columnheader">
                  Joined
                </th>
                <th scope="col" role="columnheader">
                  Status
                </th>
              </tr>
            </thead>
          )}

          <tbody role="rowgroup">
            {!filtered && (
              <tr role="row">
                <td className="cx-empty" role="cell" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}

            {filtered?.length === 0 && (
              <tr role="row">
                <td className="cx-empty" role="cell" colSpan={4}>
                  {q ? `Nobody matches “${q}”.` : "No one on the list yet."}
                </td>
              </tr>
            )}

            {filtered?.map((g, i) => (
              <tr
                className="cx-trow"
                role="row"
                key={g.id}
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <td className="cx-guest" role="cell">
                  <i className="cx-avatar" style={avatarStyle(g.email)}>
                    {initials(g.name)}
                  </i>
                  <b>{g.name}</b>
                </td>
                <td className="cx-guest-mail" role="cell" title={g.email}>
                  {g.email}
                </td>
                <td
                  className="cx-guest-date"
                  role="cell"
                  title={relative(g.createdAt, now)}
                >
                  {formatDate(g.createdAt)}
                </td>
                <td className="cx-status-cell" role="cell">
                  <StatusSelect guest={g} onStatus={onStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The decision of whether and what to write lives in `statusSelectStep`
 * (src/lib/console.ts) so it can be tested without a DOM. This component is
 * the wiring: DOM events in, machine state and PATCHes out.
 */
function StatusSelect({
  guest,
  onStatus,
}: {
  guest: Guest;
  onStatus: (id: number, status: GuestStatus) => void;
}) {
  // Only `pending` affects the render; the whole machine state is mirrored in
  // a ref because commit runs from a timeout with a stale closure.
  const [pending, setPending] = useState<GuestStatus | null>(null);
  const machine = useRef(STATUS_SELECT_INITIAL);

  // A function declaration, not a useCallback: it calls itself for the
  // deferred half of an Enter press, and a <select>'s handlers gain nothing
  // from a stable identity.
  function apply(event: StatusSelectEvent) {
    const step = statusSelectStep(machine.current, guest.status, event);
    const before = machine.current;
    machine.current = step.state;
    if (step.state.pending !== before.pending) setPending(step.state.pending);
    if (step.write) onStatus(guest.id, step.write);
    // The change event for an Enter selection fires after the key handler.
    if (step.deferCommit) setTimeout(() => apply({ type: "commit" }), 0);
  }

  const value = statusSelectValue({ pending, keyboard: false }, guest.status);

  return (
    <label
      className="cx-status"
      data-status={value}
      data-unsaved={pending !== null || undefined}
    >
      <i />
      <select
        value={value}
        aria-label={`Status for ${guest.name}`}
        onPointerDown={() => apply({ type: "pointerdown" })}
        onKeyDown={(e) => apply({ type: "keydown", key: e.key })}
        onChange={(e) => apply({ type: "change", value: e.target.value as GuestStatus })}
        onBlur={() => apply({ type: "commit" })}
      >
        {GUEST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown size={11} strokeWidth={2.25} />
    </label>
  );
}

/* ── Changelog ── */

const KIND_META: Record<
  ChangeKind,
  { label: string; heading: string; Icon: LucideIcon }
> = {
  feature: { label: "Feature", heading: "New Features", Icon: Sparkles },
  fix: { label: "Fix", heading: "Bug Fixes / Improvements", Icon: Bug },
  breaking: { label: "Breaking", heading: "Breaking Changes", Icon: CircleAlert },
};

/* The first release anyone logs against has to be called something. */
const FIRST_VERSION = "0.1.0";

/**
 * Release notes, written from this screen.
 *
 * Deliberately not wired into the 5-second poll that feeds the other two tabs.
 * Nothing but this operator writes the changelog, so polling would only buy the
 * bug the guest list already had to fix — a refresh landing mid-edit and
 * overwriting the half-typed title. It loads once per visit to the tab.
 */
function Changelog() {
  const [entries, setEntries] = useState<ChangeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guards against a state write after the tab is switched away mid-flight.
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/changelog", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/console/login";
          return;
        }
        if (!res.ok) throw new Error(`changelog returned ${res.status}`);
        const payload: { entries?: ChangeEntry[] } = await res.json();
        if (live) setEntries(payload.entries ?? []);
      } catch (err) {
        // An empty list rather than a permanent skeleton: the composer stays
        // usable, and the banner says why nothing is showing.
        if (!live) return;
        setEntries([]);
        setError(`Could not load the changelog — ${(err as Error).message}`);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const send = useCallback(async (method: string, body: unknown) => {
    const res = await fetch("/api/changelog", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      window.location.href = "/console/login";
      throw new Error("session expired");
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error ?? `${method} returned ${res.status}`);
    }
    return payload as { entry?: ChangeEntry };
  }, []);

  const add = useCallback(
    async (draft: Partial<ChangeFields>) => {
      const { entry } = await send("POST", draft);
      // The list is newest-first and this is the newest row, so it goes on top.
      if (entry) setEntries((prev) => [entry, ...(prev ?? [])]);
      setError(null);
    },
    [send],
  );

  /* ponytail: no optimistic write and no revert path, unlike the guest status
     select. That machinery exists there because a 5s poll fights the edit;
     here nothing races the request, so awaiting the row Postgres actually
     wrote is both shorter and more honest. Revisit if the round trip ever
     stops feeling instant. */
  const patch = useCallback(
    async (id: number, fields: Partial<ChangeFields>) => {
      try {
        const { entry } = await send("PATCH", { id, ...fields });
        if (entry) {
          setEntries((prev) => prev?.map((e) => (e.id === id ? entry : e)) ?? prev);
        }
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [send],
  );

  const remove = useCallback(
    async (id: number) => {
      // A changelog line has no undo and no audit trail behind it, so the
      // browser's own confirm is the whole safety net — and enough of one.
      if (!window.confirm("Remove this entry? This cannot be undone.")) return;
      try {
        await send("DELETE", { id });
        setEntries((prev) => prev?.filter((e) => e.id !== id) ?? prev);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [send],
  );

  const releases = useMemo(() => groupReleases(entries ?? []), [entries]);

  return (
    <div className="cx-pane">
      <div className="cx-log">
        <div className="cx-log-art cx-art" aria-hidden>
          <div className="cx-dither" data-tone="warm" />
        </div>

        <header className="cx-log-head">
          <h1>Changelog</h1>
          <p>
            {entries === null
              ? "Reading the release notes…"
              : entries.length
                ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"} across ${releases.length} ${releases.length === 1 ? "release" : "releases"}. Dates are Central.`
                : "Nothing logged yet. The first line goes below."}
          </p>
        </header>

        <Composer
          onAdd={add}
          onError={setError}
          latestVersion={entries?.[0]?.version ?? FIRST_VERSION}
        />

        {error && <div className="cx-error cx-log-error">{error}</div>}

        <div className="cx-log-body">
          {entries === null &&
            Array.from({ length: 3 }, (_, i) => <div className="cx-skeleton" key={i} />)}

          {entries?.length === 0 && (
            <p className="cx-log-empty">
              Every release you ship shows up here, newest first.
            </p>
          )}

          {releases.map((release, ri) => (
            <section
              className="cx-release"
              key={release.version}
              style={{ animationDelay: `${Math.min(ri, 6) * 60}ms` }}
            >
              <p className="cx-release-head">
                <b>{release.version}</b>
                <span>— {release.date}</span>
              </p>

              {release.groups.map((group) => {
                const { heading, Icon } = KIND_META[group.kind];
                return (
                  <div className="cx-kind" key={group.kind} data-kind={group.kind}>
                    <span className="cx-kind-badge" aria-hidden>
                      <Icon size={14} strokeWidth={2.25} />
                    </span>
                    <h2 className="cx-kind-head">{heading}</h2>
                    <ul className="cx-entries">
                      {group.entries.map((entry, i) => (
                        <Entry
                          key={entry.id}
                          entry={entry}
                          index={i}
                          onPatch={patch}
                          onRemove={remove}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One entry: `[code] — title (see also: #n)`, and nothing else at rest.
 *
 * Every control lives behind the ⋯ button. The first pass put a type dropdown
 * and a delete button on every row and revealed them on hover, which meant the
 * list rearranged itself under the pointer and read as a form rather than as
 * release notes.
 *
 * Deliberately not `role="menu"`. An honest menu owes arrow-key navigation and
 * roving tabindex; a panel of plain buttons is already reachable with Tab and
 * closes on Escape, and claiming the role without the keys is worse than not
 * claiming it — same call as the tab bar above.
 */
function Entry({
  entry,
  index,
  onPatch,
  onRemove,
}: {
  entry: ChangeEntry;
  index: number;
  onPatch: (id: number, fields: Partial<ChangeFields>) => void;
  onRemove: (id: number) => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [stored, setStored] = useState(entry.title);
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /* The server's row is the truth: re-sync when a write comes back, otherwise
     a rejected edit would keep showing the text the database refused. Adjusted
     during render rather than in an effect — an effect would paint the stale
     text for a frame first, and React re-runs this before anything commits. */
  if (stored !== entry.title) {
    setStored(entry.title);
    setTitle(entry.title);
  }

  // Only the open menu listens, so this is one pair of handlers on the page
  // rather than one per entry.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a button that no longer exists.
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function commit() {
    const next = title.trim();
    // A blank title is not a delete — Remove is. Put the old one back.
    if (!next) return setTitle(entry.title);
    if (next !== entry.title) onPatch(entry.id, { title: next });
  }

  function edit() {
    setOpen(false);
    field.current?.focus();
    field.current?.select();
  }

  return (
    <li
      className="cx-entry"
      ref={row}
      data-open={open || undefined}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <code className="cx-entry-code" title={entryStamp(entry.createdAt)}>
        [{entry.code}]
      </code>
      <span className="cx-entry-dash" aria-hidden>
        —
      </span>

      {/* Auto-sizing input: the wrapper's ::after mirrors the value in the same
          grid cell, so the field is exactly as wide as its text and the ref
          sits right after it, as in the reference. No measurement in JS. */}
      <span className="cx-entry-field" data-value={title}>
        <input
          ref={field}
          value={title}
          maxLength={MAX_TITLE}
          aria-label={`Description for ${entry.code}`}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setTitle(entry.title);
              e.currentTarget.blur();
            }
          }}
        />
      </span>

      {entry.ref && (
        /* Text, not a link: no repository URL is configured, and a link that
           goes nowhere is worse than a reference that reads as one.
           TRIGGER: wrap in an <a> the day a repo base URL exists. */
        <span className="cx-entry-ref">(see also: #{entry.ref})</span>
      )}

      <button
        ref={trigger}
        type="button"
        className="cx-more"
        aria-expanded={open}
        aria-label={`Actions for ${entry.code}`}
        title="Actions"
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={15} strokeWidth={2.25} />
      </button>

      {open && (
        <div className="cx-menu" aria-label={`Actions for ${entry.code}`}>
          <button type="button" className="cx-menu-item" onClick={edit}>
            <Pencil size={12} strokeWidth={2.25} />
            Edit description
          </button>

          <p className="cx-menu-label">Type</p>
          {CHANGE_KINDS.map((k) => {
            const { label, Icon } = KIND_META[k];
            return (
              <button
                key={k}
                type="button"
                className="cx-menu-item"
                data-kind={k}
                aria-pressed={k === entry.kind}
                onClick={() => {
                  setOpen(false);
                  if (k !== entry.kind) onPatch(entry.id, { kind: k });
                }}
              >
                <Icon size={12} strokeWidth={2.25} />
                {label}
                {k === entry.kind && (
                  <Check className="cx-menu-check" size={12} strokeWidth={2.5} />
                )}
              </button>
            );
          })}

          <button
            type="button"
            className="cx-menu-item cx-menu-danger"
            onClick={() => {
              setOpen(false);
              onRemove(entry.id);
            }}
          >
            <Trash2 size={12} strokeWidth={2.25} />
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The add form.
 *
 * Type and version stay put after a submit, so logging three fixes against one
 * release is three titles and three Enters. Code and ref clear, because they
 * are per-entry. A blank code is filled in server-side.
 */
function Composer({
  onAdd,
  onError,
  latestVersion,
}: {
  onAdd: (draft: Partial<ChangeFields>) => Promise<void>;
  onError: (message: string) => void;
  latestVersion: string;
}) {
  const [kind, setKind] = useState<ChangeKind>("feature");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [ref, setRef] = useState("");
  const [extras, setExtras] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Null means "the operator has not touched this", so the field tracks the
     newest release until they do — derived rather than copied into state,
     which is what keeps a late-arriving list from clobbering a half-typed
     version. */
  const [typedVersion, setVersion] = useState<string | null>(null);
  const version = typedVersion ?? latestVersion;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      await onAdd({ kind, title, version, code, ref });
      setTitle("");
      setCode("");
      setRef("");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cx-compose" onSubmit={submit}>
      <div className="cx-compose-kinds" role="group" aria-label="Type of change">
        {CHANGE_KINDS.map((k) => {
          const { label, Icon } = KIND_META[k];
          return (
            <button
              key={k}
              type="button"
              className="cx-compose-kind"
              data-kind={k}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              <Icon size={13} strokeWidth={2.25} />
              {label}
            </button>
          );
        })}
      </div>

      <input
        className="cx-compose-title"
        value={title}
        maxLength={MAX_TITLE}
        placeholder="What changed?"
        aria-label="What changed"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="cx-compose-meta">
        <label className="cx-field">
          <span>Release</span>
          <input
            value={version}
            maxLength={MAX_VERSION}
            placeholder="2.4.0"
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>

        {/* Both of these are usually left alone — the code generates itself and
            most entries have no issue to point at — so they stay folded away
            rather than sitting on screen as two more empty boxes. One-way on
            purpose: a control that hides a value the form would still submit
            is a trap. */}
        {extras ? (
          <>
            <label className="cx-field">
              <span>Code</span>
              <input
                autoFocus
                value={code}
                maxLength={MAX_CODE}
                placeholder="auto"
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label className="cx-field">
              <span>Ref</span>
              <input
                value={ref}
                maxLength={MAX_REF}
                placeholder="420"
                onChange={(e) => setRef(e.target.value)}
              />
            </label>
          </>
        ) : (
          <button type="button" className="cx-compose-more" onClick={() => setExtras(true)}>
            Add a code or ref
          </button>
        )}

        <button
          type="submit"
          className="cx-compose-add"
          disabled={busy || !title.trim() || !version.trim()}
        >
          {busy ? "Adding…" : "Add entry"}
          <CornerDownLeft size={12} strokeWidth={2.25} />
        </button>
      </div>
    </form>
  );
}

/* Stable per-person colour so the same guest always reads the same. */
function avatarStyle(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return {
    background: `linear-gradient(140deg, ${legible(h, 68)} 0%, ${legible((h + 46) % 360, 66)} 100%)`,
  };
}

/* The initials are white at 10.5px, so both gradient stops have to clear 4.5:1
   against white. A fixed lightness cannot: hue 60 at 60% lightness gives
   1.43:1. Darken per hue instead — hue is what identifies the guest, lightness
   is free. Blues barely move, yellows and greens land near 26%. */
const MAX_LUM = 1.05 / 5 - 0.05; // 5:1 against white, a little over the 4.5 floor

function legible(h: number, s: number) {
  let l = 60;
  while (l > 10 && luminance(h, s, l) > MAX_LUM) l -= 1;
  return `hsl(${h} ${s}% ${l}%)`;
}

/** WCAG relative luminance of an HSL colour. */
function luminance(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatUptime(s: number) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function relative(iso: string, now: number) {
  if (!now) return "";
  const secs = Math.round((now - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
