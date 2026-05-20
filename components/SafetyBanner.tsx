export function SafetyBanner() {
  return (
    <div
      style={{
        background: "var(--warn-bg, #1c1600)",
        borderBottom: "1px solid var(--warn-bd, #78350f40)",
        padding: "6px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11.5,
        color: "var(--warn, #F59E0B)",
        flexShrink: 0,
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <span>
        <strong>Paper trading only.</strong> This app simulates bets you describe
        manually. It does not connect to sportsbooks, place wagers, scrape accounts,
        bypass geolocation, or guarantee profit. Verify all odds in the actual
        sportsbook before risking real money.
      </span>
    </div>
  );
}
