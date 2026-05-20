import { describe, expect, it } from "vitest";
import { requiredCalculator } from "./calculator-router";

describe("requiredCalculator", () => {
  it("routes middle opportunities to the middle calculator", () => {
    expect(requiredCalculator("none", "middle")).toBe("middle");
  });
});
