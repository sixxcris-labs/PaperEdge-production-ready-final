import { describe, expect, it } from "vitest";
import {
  dollarsFromCentsOrNumber,
  dollarsFromCentsOrNumberOrNull,
  toCentsOrUndefined,
} from "./money-fields";

describe("money field adapters", () => {
  it("prefers cents values over float values", () => {
    expect(dollarsFromCentsOrNumber(1234, 99.99)).toBe(12.34);
    expect(dollarsFromCentsOrNumberOrNull(567, 1.23)).toBe(5.67);
  });

  it("falls back to float when cents are missing", () => {
    expect(dollarsFromCentsOrNumber(null, 10.25)).toBe(10.25);
    expect(dollarsFromCentsOrNumberOrNull(undefined, -3.5)).toBe(-3.5);
  });

  it("returns zero/null when both sources are unavailable", () => {
    expect(dollarsFromCentsOrNumber(undefined, undefined)).toBe(0);
    expect(dollarsFromCentsOrNumberOrNull(null, null)).toBeNull();
  });

  it("converts optional dollars to optional cents", () => {
    expect(toCentsOrUndefined(10.11)).toBe(1011);
    expect(toCentsOrUndefined(null)).toBeUndefined();
    expect(toCentsOrUndefined(undefined)).toBeUndefined();
  });
});
