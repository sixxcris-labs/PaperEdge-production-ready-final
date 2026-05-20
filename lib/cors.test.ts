import { describe, expect, it } from "vitest";
import { isAllowedLocalOrExtensionOrigin } from "./cors";

describe("extension CORS allowlist", () => {
  it("allows same-origin/server-side requests with no Origin header", () => {
    expect(isAllowedLocalOrExtensionOrigin(null)).toBe(true);
  });

  it("allows localhost and Chrome extension origins", () => {
    expect(isAllowedLocalOrExtensionOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedLocalOrExtensionOrigin("http://127.0.0.1:3001")).toBe(true);
    expect(isAllowedLocalOrExtensionOrigin("chrome-extension://abcdefghijklmnop")).toBe(true);
  });

  it("rejects arbitrary web origins", () => {
    expect(isAllowedLocalOrExtensionOrigin("https://example.com")).toBe(false);
    expect(isAllowedLocalOrExtensionOrigin("https://localhost.evil.example")).toBe(false);
  });
});
