import { describe, expect, it } from "vitest";

import {
  fromCents,
  fromCentsOrNull,
  sumCents,
  toCents,
  toCentsOrNull,
} from "./money";

describe("money cents helpers", () => {
  it("converts dollars to cents with predictable rounding", () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(12.345)).toBe(1235);
    expect(toCents(-12.345)).toBe(-1235);
  });

  it("converts cents back to dollars", () => {
    expect(fromCents(0)).toBe(0);
    expect(fromCents(1234)).toBe(12.34);
    expect(fromCents(-1234)).toBe(-12.34);
  });

  it("handles nullable values for conversion", () => {
    expect(toCentsOrNull(undefined)).toBeNull();
    expect(toCentsOrNull(null)).toBeNull();
    expect(toCentsOrNull(10.11)).toBe(1011);

    expect(fromCentsOrNull(undefined)).toBeNull();
    expect(fromCentsOrNull(null)).toBeNull();
    expect(fromCentsOrNull(1011)).toBe(10.11);
  });

  it("sums nullable cents values safely", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([100, null, undefined, -25, 5])).toBe(80);
  });
});
