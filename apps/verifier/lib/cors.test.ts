import { describe, expect, it } from "vitest";
import {
  isAllowedLocalOrExtensionOrigin,
  localExtensionCorsHeaders,
  rejectDisallowedOrigin,
} from "./cors";

describe("extension CORS allowlist", () => {
  it("rejects requests with no Origin header", () => {
    expect(isAllowedLocalOrExtensionOrigin(null)).toBe(false);
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

  it("returns 403 response for disallowed origin requests", () => {
    const req = new Request("http://localhost:3001/api/trades/import", {
      headers: { origin: "https://example.com" },
    });
    const blocked = rejectDisallowedOrigin(req, "POST, OPTIONS");
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(403);
    expect(blocked?.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });

  it("returns 403 when Origin header is missing", () => {
    const req = new Request("http://localhost:3001/api/trades/import");
    const blocked = rejectDisallowedOrigin(req, "POST, OPTIONS");
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(403);
  });

  it("sets method-specific CORS headers", () => {
    const req = new Request("http://localhost:3001/api/deep-link", {
      headers: { origin: "http://localhost:3001" },
    });
    const headers = localExtensionCorsHeaders(req, "GET, OPTIONS");
    expect(headers).toMatchObject({
      "Access-Control-Allow-Origin": "http://localhost:3001",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
  });
});
