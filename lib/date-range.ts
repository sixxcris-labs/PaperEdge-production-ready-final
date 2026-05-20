export type DateRangeKey = "7d" | "30d" | "90d" | "ytd" | "all";

export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "ytd", label: "YTD" },
  { key: "90d", label: "90D" },
  { key: "30d", label: "30D" },
  { key: "7d", label: "7D" },
];

const VALID_RANGES = new Set<DateRangeKey>(DATE_RANGE_OPTIONS.map((option) => option.key));

export function parseDateRangeKey(value: string | null | undefined): DateRangeKey {
  const normalized = String(value ?? "all").toLowerCase();
  return VALID_RANGES.has(normalized as DateRangeKey) ? (normalized as DateRangeKey) : "all";
}

export function startForDateRange(range: DateRangeKey, now = new Date()): Date | null {
  if (range === "all") return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWithinDateRange(value: Date | string | null | undefined, range: DateRangeKey, now = new Date()): boolean {
  const date = coerceDate(value);
  if (!date) return false;
  const start = startForDateRange(range, now);
  return !start || date >= start;
}

export function filterByDateRange<T>(
  items: T[],
  range: DateRangeKey,
  getDate: (item: T) => Date | string | null | undefined,
  now = new Date()
): T[] {
  if (range === "all") return items;
  return items.filter((item) => isWithinDateRange(getDate(item), range, now));
}
