import { describe, expect, it } from "vitest";
import { filterByDateRange, parseDateRangeKey, startForDateRange } from "./date-range";

describe("date range helpers", () => {
  it("parses supported range keys with all-time fallback", () => {
    expect(parseDateRangeKey("7D")).toBe("7d");
    expect(parseDateRangeKey("ytd")).toBe("ytd");
    expect(parseDateRangeKey("bad")).toBe("all");
    expect(parseDateRangeKey(null)).toBe("all");
  });

  it("computes inclusive period starts", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    expect(startForDateRange("7d", now)?.toISOString().slice(0, 10)).toBe("2026-05-14");
    expect(startForDateRange("30d", now)?.toISOString().slice(0, 10)).toBe("2026-04-21");
    expect(startForDateRange("ytd", now)?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(startForDateRange("all", now)).toBeNull();
  });

  it("filters items by date", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const rows = [
      { id: "old", date: new Date("2026-05-01T12:00:00Z") },
      { id: "recent", date: new Date("2026-05-18T12:00:00Z") },
    ];
    expect(filterByDateRange(rows, "7d", (row) => row.date, now).map((row) => row.id)).toEqual(["recent"]);
    expect(filterByDateRange(rows, "all", (row) => row.date, now).map((row) => row.id)).toEqual(["old", "recent"]);
  });
});
