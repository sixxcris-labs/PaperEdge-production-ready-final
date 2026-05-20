"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 800);
  }

  return (
    <button
      className="btn ghost"
      onClick={handleClick}
      style={spinning ? { opacity: 0.6 } : undefined}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={spinning ? { animation: "spin 0.7s linear infinite" } : undefined}
      >
        <path d="M21 12a9 9 0 1 1-3-6.7"/>
        <path d="M21 3v6h-6"/>
      </svg>
      Refresh
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
