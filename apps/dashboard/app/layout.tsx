import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "OddsFlex · Paper Trading Dashboard",
  description: "A process-gated paper-trading journal for sports betting workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ margin: 0, height: "100%" }}>
        <div className="shell">
          <Sidebar />
          <div className="main">
            <TopBar />
            <SafetyBanner />
            {children}
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
