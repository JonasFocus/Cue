"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, PenLine, Search } from "lucide-react";
import type { ServiceHealth } from "@/lib/docker";
import type { Guest, WaitlistStats } from "@/lib/db";
import { GUEST_STATUSES, type GuestStatus } from "@/lib/waitlist";

type Probe = { ok: boolean; latencyMs: number; detail: string };

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
  const [tab, setTab] = useState<"overview" | "guests">("overview");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [guests, setGuests] = useState<Guest[] | null>(null);
  // The API caps the list; when it does, the count on screen is not the total.
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
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
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  return (
    <div className="cx">
      <div className="cx-col">
        <header className="cx-top">
          <span className="cx-mark">
            <PenLine size={13} strokeWidth={2.25} />
          </span>
          <span className="cx-wordmark">
            Console<span>staging.cue.krevo.io</span>
          </span>
          <span className="cx-who">{operator}</span>
          <button className="cx-signout" onClick={signOut} type="button" title="Sign out">
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
        </nav>

        {error && (
          <div className="cx-error" role="alert">
            {error}
          </div>
        )}

        {degraded && (
          <div className="cx-degraded" role="status">
            Health reporting is degraded — {degraded}. The guest list below is
            unaffected. Retrying every {POLL_MS / 1000}s.
          </div>
        )}

        <main>
          {tab === "overview" ? (
            <Overview snap={snap} degraded={degraded} />
          ) : (
            <GuestList
              guests={guests}
              truncated={truncated}
              now={now}
              onStatus={setStatus}
            />
          )}
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
 * A native <select> writes to the database, so it must not PATCH on every
 * change event: arrowing from Pending to Blacklisted fires three intermediate
 * changes and would persist each one. Keyboard edits are held and committed on
 * Enter or blur; mouse selection still commits the moment an option is picked.
 */
function StatusSelect({
  guest,
  onStatus,
}: {
  guest: Guest;
  onStatus: (id: number, status: GuestStatus) => void;
}) {
  // Uncommitted keyboard selection. Null means "show the stored status", so a
  // poll or a revert flows straight through without a sync effect.
  const [pending, setPending] = useState<GuestStatus | null>(null);
  // Mirrored in a ref because commit runs from a timeout with a stale closure.
  const pendingRef = useRef<GuestStatus | null>(null);
  const keyboard = useRef(false);
  const value = pending ?? guest.status;

  const commit = useCallback(() => {
    const next = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (next && next !== guest.status) onStatus(guest.id, next);
  }, [guest.id, guest.status, onStatus]);

  return (
    <label className="cx-status" data-status={value}>
      <i />
      <select
        value={value}
        aria-label={`Status for ${guest.name}`}
        onPointerDown={() => {
          keyboard.current = false;
        }}
        onKeyDown={(e) => {
          keyboard.current = true;
          // The change event for an Enter selection fires after this handler.
          if (e.key === "Enter") setTimeout(commit, 0);
        }}
        onChange={(e) => {
          const next = e.target.value as GuestStatus;
          if (keyboard.current) {
            pendingRef.current = next;
            setPending(next);
          } else {
            onStatus(guest.id, next);
          }
        }}
        onBlur={commit}
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

/* Stable per-person colour so the same guest always reads the same. */
function avatarStyle(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return {
    background: `linear-gradient(140deg, hsl(${h} 68% 60%) 0%, hsl(${(h + 46) % 360} 66% 50%) 100%)`,
  };
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
