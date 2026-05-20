"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { ICONS } from "./Sidebar";

function getTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/trades/new") return "Add Paper Trade";
  if (pathname === "/trades/import") return "Import OddsJam";
  if (pathname === "/settlement") return "Settlement Review";
  if (pathname === "/pnl") return "Profit / Loss Tracker";
  if (pathname === "/mistakes") return "Mistake Log";
  if (pathname === "/books") return "Book Performance";
  if (pathname === "/trades") return "Locked Trades";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/books/manage") return "Manage Books";
  if (pathname.startsWith("/trades/") && pathname.endsWith("/settle")) return "Settle Trade";
  if (pathname.match(/^\/trades\/[^/]+$/)) return "Trade Detail";
  return "OddsFlex";
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getTitle(pathname);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const q = e.currentTarget.value.trim();
      if (q) router.push(`/trades?search=${encodeURIComponent(q)}`);
    }
  }

  function handleSearchClick() {
    inputRef.current?.focus();
  }

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>OddsFlex</span>
        <span className="sep">/</span>
        <b>{title}</b>
      </div>
      <span className="badge b-info" title="No real money is placed by this app.">
        <span className="dot" />Paper account · Practice only
      </span>
      <div className="spacer" />
      <div className="search" onClick={handleSearchClick} style={{ cursor: "text" }}>
        {ICONS.search}
        <input
          ref={inputRef}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg-2)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
          placeholder="Search trades, events, books…"
          onKeyDown={handleSearchKey}
        />
        <kbd>⌘K</kbd>
      </div>
      <button
        className="icon-btn"
        title="Notifications"
        onClick={() => router.push("/mistakes")}
      >
        {ICONS.bell}
      </button>
      <button className="icon-btn" onClick={() => router.push("/settings")} title="Settings">
        {ICONS.cog}
      </button>
    </header>
  );
}
