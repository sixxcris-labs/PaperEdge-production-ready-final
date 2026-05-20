export function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function parseDollarsToCents(s: string): number {
  const cleaned = s.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const dollars = Number.parseFloat(cleaned);
  if (Number.isNaN(dollars)) return 0;
  return Math.round(dollars * 100);
}
