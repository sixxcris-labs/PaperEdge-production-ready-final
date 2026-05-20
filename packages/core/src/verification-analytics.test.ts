import { describe, expect, it } from "vitest";
import { buildPerBookPassRates, buildVerificationFunnel, verificationBucket } from "./verification-analytics";

describe("verification analytics", () => {
  it("groups verifier statuses into stable buckets", () => {
    expect(verificationBucket("queued_for_verification")).toBe("queued");
    expect(verificationBucket("verifying_book_a")).toBe("verifying");
    expect(verificationBucket("ready_to_lock")).toBe("ready");
    expect(verificationBucket("failed_market_mismatch")).toBe("failed");
  });

  it("builds a complete funnel", () => {
    const funnel = buildVerificationFunnel([
      { status: "imported" },
      { status: "locked" },
      { status: "failed_book_unavailable" },
    ]);
    expect(funnel.map((row) => row.bucket)).toEqual([
      "imported",
      "queued",
      "verifying",
      "ready",
      "locked",
      "failed",
      "skipped",
    ]);
    expect(funnel.find((row) => row.bucket === "locked")?.count).toBe(1);
  });

  it("summarizes per-book pass rates", () => {
    const rows = buildPerBookPassRates([
      { status: "locked", bookA: { id: "a", name: "A" } },
      { status: "failed_market_mismatch", bookA: { id: "a", name: "A" } },
    ]);
    expect(rows[0]).toMatchObject({ bookId: "a", total: 2, passed: 1, failed: 1 });
    expect(rows[0].passRatePct).toBe(50);
  });
});
