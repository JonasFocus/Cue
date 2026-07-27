"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import {
  Check,
  Clock,
  FileText,
  Inbox,
  LayoutTemplate,
  LogOut,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { CueMark } from "@/components/cue-mark";
import { FREE_SENT_ALLOWANCE, groupCount, STATUS_GROUPS, type Plan } from "@/lib/cue";

/* ponytail: the whole nav is one client module rather than a server shell with
   client leaves. Every item needs `data-active`, which needs the current path
   and the `status` query — so a server Sidebar would end up wrapping each of
   nine links in its own client component and shipping the same hooks anyway.
   All the data still comes from the server as plain props; nothing here reads
   the database or the session. */

const client = createAuthClient();

type Item = { href: string; label: string; icon: LucideIcon; count?: number };

/* `?status=` is the filter contract with the workspace page, so an item's own
   href is the only place the filter is spelled. */
function isActive(href: string, pathname: string, status: string | null): boolean {
  const [path, query] = href.split("?");
  const want = query ? new URLSearchParams(query).get("status") : null;
  // The workspace root is the same path for every filter — only the query
  // separates "All Cues" from "Awaiting", so an exact query match decides it.
  if (path === "/app") return pathname === "/app" && status === want;
  return pathname === path || pathname.startsWith(`${path}/`);
}

async function signOut() {
  await client.signOut();
  // A hard navigation, not router.push: it drops every cached RSC payload for
  // the workspace, so the next person on this browser cannot see the last
  // one's Cues flash before the redirect.
  window.location.href = "/";
}

export function Sidebar({
  studioName,
  email,
  plan,
  sentCount,
  counts,
}: {
  studioName: string;
  email: string;
  plan: Plan;
  sentCount: number;
  counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const status = useSearchParams().get("status");

  /* Counts come from the same group definitions the workspace filters by, so
     a sidebar reading "Awaiting 2" can never sit next to a list of four rows.
     "Awaiting" covers sent + opened + partially_signed — see STATUS_GROUPS. */
  const ICON: Record<string, LucideIcon> = {
    all: Inbox,
    sent: Clock,
    signed: Check,
    draft: FileText,
  };

  const workspace: Item[] = STATUS_GROUPS.map((group) => ({
    href: group.key === "all" ? "/app" : `/app?status=${group.key}`,
    label: group.key === "all" ? "All Cues" : group.label,
    icon: ICON[group.key] ?? Inbox,
    count: groupCount(group, counts),
  }));

  const studio: Item[] = [
    { href: "/app/new", label: "Templates", icon: LayoutTemplate },
    { href: "/app/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="ca-side" aria-label="Workspace">
      <span className="ca-brand">
        <span className="ca-brand-mark">
          <CueMark size={15} />
        </span>
        Cue
      </span>

      <Link
        className="ca-btn ca-btn-primary ca-btn-block"
        href="/app/new"
        style={{ marginBottom: 4 }}
      >
        <Plus size={15} strokeWidth={2.5} />
        New Cue
      </Link>

      <span className="ca-side-label">Workspace</span>
      {workspace.map((item) => (
        <NavItem key={item.href} item={item} pathname={pathname} status={status} />
      ))}

      <span className="ca-side-label">Studio</span>
      {studio.map((item) => (
        <NavItem key={item.href} item={item} pathname={pathname} status={status} />
      ))}

      <div className="ca-side-foot">
        <p className="ca-truncate" style={{ fontSize: 13, fontWeight: 500 }} title={studioName}>
          {studioName}
        </p>
        <p className="ca-truncate ca-help" style={{ marginTop: 1 }} title={email}>
          {email}
        </p>

        <PlanMeter plan={plan} sentCount={sentCount} />

        <button
          className="ca-btn ca-btn-quiet ca-btn-block"
          type="button"
          onClick={signOut}
          style={{ marginTop: 6, fontSize: 13 }}
        >
          <LogOut size={14} strokeWidth={2} />
          Sign out
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  item,
  pathname,
  status,
}: {
  item: Item;
  pathname: string;
  status: string | null;
}) {
  const Icon = item.icon;
  const active = isActive(item.href, pathname, status);
  return (
    <Link
      className="ca-side-item"
      href={item.href}
      data-active={active}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={15} strokeWidth={1.75} />
      {item.label}
      {item.count !== undefined && item.count > 0 ? <b>{item.count}</b> : null}
    </Link>
  );
}

/* The free allowance is five *total* sent Cues, so this is a lifetime meter,
   not a monthly one — the copy says "sent", never "this month". */
function PlanMeter({ plan, sentCount }: { plan: Plan; sentCount: number }) {
  if (plan !== "free") {
    return (
      <div style={{ margin: "12px 0 10px" }}>
        <span className="ca-pill" data-tone="ok">
          {plan === "creator" ? "Creator" : "Studio"} plan
        </span>
      </div>
    );
  }

  const used = Math.min(sentCount, FREE_SENT_ALLOWANCE);
  const spent = sentCount >= FREE_SENT_ALLOWANCE;
  const fill: CSSProperties = {
    display: "block",
    width: `${(used / FREE_SENT_ALLOWANCE) * 100}%`,
    height: "100%",
    borderRadius: "inherit",
    background: spent ? "var(--ca-warn)" : "var(--ca-accent)",
    transition: "width var(--ca-mid) var(--ca-ease)",
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="ca-spread ca-help" style={{ marginTop: 0 }}>
        <span style={{ color: "var(--ca-ink)" }}>Free plan</span>
        <span className="ca-nums">
          {used} of {FREE_SENT_ALLOWANCE}
        </span>
      </div>

      {/* aria-hidden: the row above already says "3 of 5" in text, and a second
          announcement of the same number is noise, not information. */}
      <div
        aria-hidden
        style={{
          margin: "7px 0 9px",
          height: 4,
          borderRadius: "var(--ca-r-pill)",
          background: "var(--ca-line)",
          overflow: "hidden",
        }}
      >
        <i style={fill} />
      </div>

      <p className="ca-help" style={{ marginTop: 0, marginBottom: 9 }}>
        {spent
          ? "You have used all five free Cues."
          : `${FREE_SENT_ALLOWANCE - used} free ${
              FREE_SENT_ALLOWANCE - used === 1 ? "Cue" : "Cues"
            } left to send.`}
      </p>

      {/* Billing is deliberately unwired for version one. The label has to say
          so too: "Upgrade" promises a checkout, and every CTA on /#pricing reads
          "Join the waitlist" — so the button would have led somewhere that
          cannot do what the button said. Settings and the builder already
          route plan interest to email; this now matches them. */}
      <a
        className="ca-btn ca-btn-dark ca-btn-block"
        href="mailto:hello@krevo.io?subject=Cue%20plan"
        style={{ fontSize: 13 }}
      >
        Ask about a plan
      </a>
    </div>
  );
}

/* Bottom tab bar, phones only (.ca-tabbar is display:none from 900px). Four
   destinations, no overflow menu: a photographer moving between Awaiting and
   Signed one-handed should reach both with a thumb. Settings and Templates
   live on the pages themselves at this width. */
export function TabBar() {
  const pathname = usePathname();
  const status = useSearchParams().get("status");

  const tabs: Item[] = [
    { href: "/app", label: "All", icon: Inbox },
    { href: "/app?status=sent", label: "Awaiting", icon: Clock },
    { href: "/app?status=signed", label: "Signed", icon: Check },
    { href: "/app/new", label: "New", icon: Plus },
  ];

  return (
    <nav className="ca-tabbar" aria-label="Workspace">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname, status);
        return (
          <Link
            className="ca-tab"
            key={href}
            href={href}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={active ? 2.25 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
