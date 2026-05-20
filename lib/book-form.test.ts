import { describe, expect, it } from "vitest";
import { parseBookFormData } from "./book-form";

describe("parseBookFormData", () => {
  it("treats managed-book checkbox true string as checked", () => {
    const formData = new FormData();
    formData.set("name", "Novig");
    formData.set("role", "exchange");
    formData.set("currentBalance", "100");
    formData.set("rolloverRemaining", "0");
    formData.set("kycCompleted", "true");

    expect(parseBookFormData(formData).kycCompleted).toBe(true);
  });

  it("treats native form checkbox on value as checked", () => {
    const formData = new FormData();
    formData.set("name", "Fliff");
    formData.set("role", "social");
    formData.set("kycCompleted", "on");

    expect(parseBookFormData(formData).kycCompleted).toBe(true);
  });

  it("accepts prediction market roles", () => {
    const formData = new FormData();
    formData.set("name", "Kalshi");
    formData.set("role", "prediction_market");

    expect(parseBookFormData(formData).role).toBe("prediction_market");
  });

  it("rejects unknown book roles", () => {
    const formData = new FormData();
    formData.set("name", "Test Book");
    formData.set("role", "not_a_role");

    expect(() => parseBookFormData(formData)).toThrowError();
  });
});
