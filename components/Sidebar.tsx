"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ── Tiny inline SVG icons ─────────────────────────────── */
function Ico({ d, size = 16, sw = 1.6 }: { d: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  );
}

export const ICONS = {
  dashboard: (
    <Ico d={<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>} />
  ),
  plus: <Ico d={<><path d="M12 5v14M5 12h14"/></>} />,
  lock: <Ico d={<><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>} />,
  flag: <Ico d={<><path d="M4 21V4l8 2 8-2v11l-8 2-8-2v6"/></>} />,
  chart: <Ico d={<><path d="M4 20V8M10 20v-7M16 20v-4M22 20V4"/></>} />,
  alert: <Ico d={<><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/></>} />,
  book: <Ico d={<><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/></>} />,
  cog: (
    <Ico d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />
  ),
  info: <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>} />,
  search: <Ico d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>} />,
  bell: <Ico d={<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>} />,
  check: <Ico d={<path d="m5 12 5 5L20 7"/>} sw={2.4} />,
  x: <Ico d={<path d="M6 6l12 12M18 6 6 18"/>} />,
  arrow: <Ico d={<path d="M5 12h14M13 6l6 6-6 6"/>} />,
  back: <Ico d={<path d="M19 12H5M11 18l-6-6 6-6"/>} />,
  up: <Ico d={<path d="m6 15 6-6 6 6"/>} />,
  down: <Ico d={<path d="m6 9 6 6 6-6"/>} />,
  download: <Ico d={<><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>} />,
  filter: <Ico d={<path d="M3 5h18l-7 8v6l-4 2v-8z"/>} />,
  edit: <Ico d={<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></>} />,
  trash: <Ico d={<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>} />,
  refresh: <Ico d={<><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></>} />,
  clock: <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  link: <Ico d={<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>} />,
  camera: <Ico d={<><path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="4"/></>} />,
  scale: <Ico d={<><path d="M12 3v18M3 9h18M5 9l3 6h2zm14 0-3 6h-2z"/></>} />,
};

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  countColor?: string;
  exactMatch?: boolean;
}

function NavItem({ href, label, icon, count, countColor, exactMatch }: NavItemProps) {
  const pathname = usePathname();
  const isActive = exactMatch
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link href={href} className={`nav-item ${isActive ? "active" : ""}`}>
      <span className="ico">{icon}</span>
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="count" style={countColor ? { color: countColor } : undefined}>
          {count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">PE</div>
        <div>
          <div className="brand-name">PaperEdge</div>
          <div className="brand-sub">Paper Trading</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-section">Workspace</div>
        <NavItem href="/" label="Dashboard" icon={ICONS.dashboard} exactMatch />
        <NavItem href="/trades/new" label="Add Paper Trade" icon={ICONS.plus} />
        <NavItem href="/trades/import" label="Import Trades" icon={ICONS.download} />
        <NavItem href="/trades" label="Locked Trades" icon={ICONS.lock} />
        <NavItem href="/settlement" label="Settlement Review" icon={ICONS.flag} />
        <NavItem href="/pnl" label="Profit/Loss Tracker" icon={ICONS.chart} />
        <NavItem href="/mistakes" label="Mistake Log" icon={ICONS.alert} />
        <NavItem href="/books" label="Book Performance" icon={ICONS.book} />

        <div className="nav-section">Account</div>
        <NavItem href="/settings" label="Settings" icon={ICONS.cog} />
        <NavItem href="/books/manage" label="Manage Books" icon={ICONS.book} />
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">PT</div>
        <div className="who">
          <b>Paper Trader</b>
          <span>verification-first · v1.0</span>
        </div>
      </div>
    </aside>
  );
}
