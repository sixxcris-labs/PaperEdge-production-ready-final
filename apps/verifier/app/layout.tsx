import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "PaperEdge Verifier",
  description: "Verification-first import queue for PaperEdge paper trades.",
};

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="nav-item"><span>{children}</span></Link>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ margin: 0, height: "100%" }}>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">PE</div>
              <div>
                <div className="brand-name">PaperEdge</div>
                <div className="brand-sub">Verifier</div>
              </div>
            </div>
            <nav className="nav">
              <div className="nav-section">Verification</div>
              <NavItem href="/">Verification Health</NavItem>
              <NavItem href="/import">Bulk Import</NavItem>
              <NavItem href="/verify">Verification Queue</NavItem>
              <NavItem href="/locked">Locked From Queue</NavItem>
              <NavItem href="/settlement">Settlement Suggestions</NavItem>
              <NavItem href="/skipped">Skipped / Failed</NavItem>
              <div className="nav-section">Admin</div>
              <a className="nav-item" href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000"}>Dashboard</a>
            </nav>
            <div className="sidebar-foot">
              <div className="avatar">VF</div>
              <div className="who"><b>Verifier</b><span>local only · no auto-betting</span></div>
            </div>
          </aside>
          <div className="main">
            <SafetyBanner />
            {children}
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
