"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function RunScanButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function runScan() {
    if (running) return;
    setRunning(true);
    const t = toast.loading("Scanning books… capturing odds and detecting edges");
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Scan complete — results refreshed", { id: t });
        router.refresh();
      } else {
        toast.error(`Scan failed (exit ${data.exitCode ?? "?"}). See server logs.`, { id: t });
      }
    } catch (err) {
      toast.error(`Scan error: ${err instanceof Error ? err.message : String(err)}`, { id: t });
    } finally {
      setRunning(false);
    }
  }

  return (
    <button className="btn primary" onClick={runScan} disabled={running} aria-busy={running}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={running ? { animation: "spin 0.7s linear infinite" } : undefined}
      >
        {running ? (
          <path d="M21 12a9 9 0 1 1-3-6.7" />
        ) : (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </>
        )}
      </svg>
      {running ? "Scanning…" : "Run Scan"}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
