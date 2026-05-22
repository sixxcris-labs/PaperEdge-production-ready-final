import { describe, expect, it } from "vitest";

import { GET, OPTIONS } from "./route";

describe("deep-link API route", () => {
  it("returns 400 when bookId is missing", async () => {
    const req = new Request("http://localhost:3001/api/deep-link?sport=nba", {
      headers: { origin: "http://localhost:3001" },
    });

    const res = await GET(req);
    const body = await res.text();

    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    expect(body).toContain("bookId is required");
  });

  it("rejects disallowed origins", async () => {
    const req = new Request("http://localhost:3001/api/deep-link?bookId=book_1", {
      headers: { origin: "https://example.com" },
    });

    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });

  it("applies the same origin policy to OPTIONS", async () => {
    const req = new Request("http://localhost:3001/api/deep-link?bookId=book_1", {
      method: "OPTIONS",
      headers: { origin: "https://example.com" },
    });

    const res = await OPTIONS(req);

    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });
});
