export type VerificationBucket =
  | "imported"
  | "queued"
  | "verifying"
  | "ready"
  | "locked"
  | "failed"
  | "skipped";

export interface VerificationOpportunityLike {
  status: string;
  bookAId?: string | null;
  bookBId?: string | null;
  bookA?: { id?: string | null; name?: string | null } | null;
  bookB?: { id?: string | null; name?: string | null } | null;
}

export interface VerificationFunnelRow {
  bucket: VerificationBucket;
  count: number;
}

export interface BookPassRateRow {
  bookId: string;
  bookName: string;
  total: number;
  passed: number;
  failed: number;
  passRatePct: number;
}

const BUCKET_ORDER: VerificationBucket[] = [
  "imported",
  "queued",
  "verifying",
  "ready",
  "locked",
  "failed",
  "skipped",
];

export function verificationBucket(status: string): VerificationBucket {
  if (status === "locked") return "locked";
  if (status === "skipped") return "skipped";
  if (status.startsWith("failed_")) return "failed";
  if (status === "ready_to_lock" || status === "stake_recalculated") return "ready";
  if (status.startsWith("verifying") || status.includes("verified") || status === "market_match_confirmed") {
    return "verifying";
  }
  if (status === "queued_for_verification") return "queued";
  return "imported";
}

export function buildVerificationFunnel(
  opportunities: VerificationOpportunityLike[],
): VerificationFunnelRow[] {
  const counts = new Map<VerificationBucket, number>(BUCKET_ORDER.map((b) => [b, 0]));
  for (const opp of opportunities) {
    const bucket = verificationBucket(opp.status);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return BUCKET_ORDER.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

export function buildPerBookPassRates(
  opportunities: VerificationOpportunityLike[],
): BookPassRateRow[] {
  const rows = new Map<string, BookPassRateRow>();

  for (const opp of opportunities) {
    for (const book of [opp.bookA, opp.bookB]) {
      const id = book?.id;
      if (!id) continue;
      const existing = rows.get(id) ?? {
        bookId: id,
        bookName: book?.name ?? "Unknown book",
        total: 0,
        passed: 0,
        failed: 0,
        passRatePct: 0,
      };
      existing.total += 1;
      if (opp.status === "locked") existing.passed += 1;
      if (opp.status.startsWith("failed_") || opp.status === "skipped") existing.failed += 1;
      rows.set(id, existing);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      passRatePct: row.total > 0 ? (row.passed / row.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.bookName.localeCompare(b.bookName));
}
