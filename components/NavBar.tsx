"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/books", label: "Books" },
  { href: "/trades", label: "Journal" },
  { href: "/trades/new", label: "+ New Trade" },
  { href: "/trades/import", label: "Import OddsJam" },
  { href: "/mistakes", label: "Mistakes" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-white px-4">
      <div className="mx-auto max-w-7xl flex items-center gap-1 h-12">
        <span className="font-bold text-sm mr-4 text-slate-800">PaperEdge</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "px-3 py-1.5 rounded text-sm transition-colors",
              pathname === l.href
                ? "bg-slate-100 text-slate-900 font-medium"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
