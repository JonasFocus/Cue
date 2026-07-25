"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, PenLine, Search } from "lucide-react";
import type { ServiceHealth } from "@/lib/docker";
import type { Guest } from "@/lib/db";
import { GUEST_STATUSES, type GuestStatus } from "@/lib/waitlist";

type Probe = { ok: boolean; latencyMs: number; detail: string };

type Snapshot = {
  generatedAt: string;
  containers: ServiceHealth[];
  probes: { postgres: Probe; redis: Probe };
  waitlist: {
    total: number;
    today: number;
    week: number;
    latest: { email: string; createdAt: string }[];
  };
};

const POLL_MS = 5000;

export function Dashboard({ operator }: { operator: string }) {
  const [tab, setTab] = useState<"overview" | "guests">("overview");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      if (!health.ok) throw new Error(`health returned ${health.status}`);
      setSnap(await health.json());
      const listed = list.ok ? (await list.json()).guests : null;
      if (listed && mutating.current === 0) setGuests(listed);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
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

        <nav className="cx-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            className="cx-tab"
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "guests"}
            className="cx-tab"
            onClick={() => setTab("guests")}
          >
            Guest list
            {guests ? <b>{guests.length}</b> : null}
          </button>
        </nav>

        {error && (
          <div className="cx-error" role="alert">
            Lost contact with the API — {error}. Retrying every {POLL_MS / 1000}s.
          </div>
        )}

        {tab === "overview" ? (
          <Overview snap={snap} />
        ) : (
          <GuestList guests={guests} now={now} onStatus={setStatus} />
        )}
      </div>
    </div>
  );
}

/* ── Overview ── */

function Overview({ snap }: { snap: Snapshot | null }) {
  const running = snap?.containers.filter((c) => c.state === "running").length ?? 0;
  const total = snap?.containers.length ?? 0;
  const storesOk = (snap?.probes.postgres.ok ?? false) && (snap?.probes.redis.ok ?? false);
  const allUp = total > 0 && running === total && storesOk;
  const memory = snap?.containers.reduce((a, c) => a + c.memoryUsedMb, 0) ?? 0;

  return (
    <div className="cx-pane">
      <section className="cx-hero">
        <div className="cx-hero-art cx-art" aria-hidden>
          <div className="cx-dither" />
        </div>
        <div className="cx-hero-body">
          <span className={`cx-hero-status ${!snap ? "cx-idle" : allUp ? "cx-ok" : "cx-warn"}`}>
            <span className="cx-dot" />
            {!snap ? "Connecting" : allUp ? "All systems operational" : "Degraded"}
          </span>

          <h1 className="cx-hero-title">
            {!snap
              ? "Reading the box…"
              : allUp
                ? "Everything is running."
                : "Something needs a look."}
          </h1>
          <p className="cx-hero-sub">
            {snap
              ? `${running} of ${total} services up, Postgres and Redis answering, and the waitlist is open.`
              : "Fetching container health and datastore probes."}
          </p>

          <div className="cx-figures">
            <span className="cx-figure">
              <b>{snap ? `${running}/${total}` : "—"}</b>
              <span>services</span>
            </span>
            <span className="cx-figure">
              <b>{snap ? snap.waitlist.total.toLocaleString() : "—"}</b>
              <span>on the waitlist</span>
            </span>
            <span className="cx-figure">
              <b>{snap ? `+${snap.waitlist.week}` : "—"}</b>
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
        {!snap &&
          Array.from({ length: 5 }, (_, i) => <div className="cx-skeleton" key={i} />)}

        {snap?.containers.map((c, i) => (
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
        <ProbeRow name="postgres" hint="SELECT version()" probe={snap?.probes.postgres} />
        <ProbeRow name="redis" hint="PING" probe={snap?.probes.redis} />
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
  now,
  onStatus,
}: {
  guests: Guest[] | null;
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
          <h2>Guest list</h2>
          <p>
            {guests?.length
              ? `${guests.length} ${guests.length === 1 ? "person is" : "people are"} waiting to hear from you.`
              : "Everyone who asked to be told when Cue opens up."}
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

        <div role="table">
          {/* Column headers over an empty table label nothing — hide them. */}
          {!!filtered?.length && (
            <div className="cx-thead" role="row">
              <span>Name</span>
              <span>Email</span>
              <span>Joined</span>
              <span>Status</span>
            </div>
          )}

          {!filtered && <div className="cx-empty">Loading…</div>}

          {filtered?.length === 0 && (
            <div className="cx-empty">
              {q ? `Nobody matches “${q}”.` : "No one on the list yet."}
            </div>
          )}

          {filtered?.map((g, i) => (
            <div
              className="cx-trow"
              role="row"
              key={g.id}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <span className="cx-guest">
                <i className="cx-avatar" style={avatarStyle(g.email)}>
                  {initials(g.name)}
                </i>
                <b>{g.name}</b>
              </span>
              <span className="cx-guest-mail" title={g.email}>
                {g.email}
              </span>
              <span className="cx-guest-date" title={relative(g.createdAt, now)}>
                {formatDate(g.createdAt)}
              </span>
              <label className="cx-status" data-status={g.status}>
                <i />
                <select
                  value={g.status}
                  aria-label={`Status for ${g.name}`}
                  onChange={(e) => onStatus(g.id, e.target.value as GuestStatus)}
                >
                  {GUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={11} strokeWidth={2.25} />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function signOut() {
  await fetch("/api/auth/sign-out", { method: "POST" });
  window.location.href = "/console/login";
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
