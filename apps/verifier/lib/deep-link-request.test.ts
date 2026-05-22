import { describe, expect, it } from "vitest";

import {
  parseDeepLinkQuery,
  sanitizeResolvedUrl,
  type DeepLinkQuery,
} from "./deep-link-request";

describe("deep-link request parsing", () => {
  it("requires a non-empty bookId", () => {
    expect(() => parseDeepLinkQuery(new URLSearchParams("sport=nba"))).toThrow(
      "bookId is required",
    );
  });

  it("normalizes optional fields and defaults", () => {
    const query = parseDeepLinkQuery(
      new URLSearchParams({
        bookId: "book_123",
        sport: "  nba  ",
        marketType: "  player-prop ",
        player: "  Chet Holmgren ",
      }),
    );

    expect(query).toEqual<DeepLinkQuery>({
      bookId: "book_123",
      sport: "nba",
      marketType: "player-prop",
      player: "Chet Holmgren",
      team: undefined,
      event: undefined,
    });
  });

  it("rejects oversized query values", () => {
    const long = "x".repeat(1001);
    expect(() => parseDeepLinkQuery(new URLSearchParams({ bookId: "b", event: long }))).toThrow(
      "event is too long",
    );
  });
});

describe("deep-link URL output policy", () => {
  it("allows safe URLs", () => {
    expect(sanitizeResolvedUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(sanitizeResolvedUrl("http://localhost:3000/trades")).toBe("http://localhost:3000/trades");
    expect(sanitizeResolvedUrl("about:blank")).toBe("about:blank");
  });

  it("falls back for unsafe URLs", () => {
    expect(sanitizeResolvedUrl("javascript:alert(1)")).toBe("about:blank");
    expect(sanitizeResolvedUrl("data:text/html,boom")).toBe("about:blank");
    expect(sanitizeResolvedUrl("  ")).toBe("about:blank");
  });
});
