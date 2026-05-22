/**
 * Shared ingestion helpers: figure out which book a raw JSON file came from and
 * dispatch it to the right adapter. Used by the watcher (and later the pollers)
 * so book/shape detection lives in one place.
 */
import { basename } from "node:path";

import type { NormalizedMarket } from "../../packages/core/src/market-normalization";
import { normalizeBovadaMarkets } from "../../packages/core/src/adapters/bovada";
import { normalizeNovigMarkets } from "../../packages/core/src/adapters/novig";
import { normalizeProphetXMarkets } from "../../packages/core/src/adapters/prophetx";

export type Book = "bovada" | "novig" | "prophetx";

/**
 * Detect the book from filename first (cheap, explicit), then fall back to a
 * structural sniff of the JSON. Returns null when nothing matches.
 */
export function detectBook(raw: unknown, filePath: string): Book | null {
  const name = basename(filePath).toLowerCase();
  if (name.includes("bovada")) return "bovada";
  if (name.includes("novig")) return "novig";
  if (name.includes("prophet")) return "prophetx";

  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return null;
  }

  // Bovada: events -> displayGroups -> markets -> outcomes -> price.american
  if (/"displayGroups"/.test(text) || /"price":\s*\{[^}]*"american"/.test(text)) return "bovada";
  // Novig: GraphQL event/market shapes, order-book ladders, or available/strike fields
  if (/"data":\s*\{\s*"event"|"data":\s*\{\s*"market"|"ladders"|"available"|"strike"/.test(text)) return "novig";
  // ProphetX: selections with displayOdds
  if (/"selections"|"displayOdds"/.test(text)) return "prophetx";

  return null;
}

export function normalizeByBook(book: Book, raw: unknown): NormalizedMarket[] {
  switch (book) {
    case "bovada":
      // No sport/league override: let the adapter derive from the payload so
      // this works across sports/fixtures, not just the OKC/SAS NBA event.
      return normalizeBovadaMarkets(raw as never);
    case "novig":
      return normalizeNovigMarkets(raw as never);
    case "prophetx":
      return normalizeProphetXMarkets(raw as never);
    default:
      return [];
  }
}

/** Strip the heavy per-row `raw` context for the flat JSONL artifact. */
export function toSerializable(rows: NormalizedMarket[]): Omit<NormalizedMarket, "raw">[] {
  return rows.map(({ raw: _raw, ...rest }) => rest);
}
