import { basename } from "node:path";
import type { NormalizedMarket } from "../../packages/core/src/market-normalization";
import { normalizeBovadaMarkets } from "../../packages/core/src/adapters/bovada";
import { normalizeNovigMarkets } from "../../packages/core/src/adapters/novig";
import { normalizeProphetXMarkets } from "../../packages/core/src/adapters/prophetx";
import { normalizeRebetMarkets } from "../../packages/core/src/adapters/rebet";
export type Book = "bovada" | "novig" | "prophetx" | "rebet";
export function detectBook(raw: unknown, filePath: string): Book | null {
  const name = basename(filePath).toLowerCase();
  if (name.includes("bovada")) return "bovada";
  if (name.includes("novig")) return "novig";
  if (name.includes("prophet")) return "prophetx";
  if (name.includes("rebet")) return "rebet";
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return null;
  }
  if (/"displayGroups"/.test(text) || /"price":\s*\{[^}]*"american"/.test(text)) return "bovada";
  if (/"data":\s*\{\s*"event"|"data":\s*\{\s*"market"|"ladders"|"available"|"strike"/.test(text)) return "novig";
  if (/"market_data"|"display_odds"|"competitors"/.test(text)) return "rebet";
  if (/"selections"|"displayOdds"/.test(text)) return "prophetx";
  return null;
}
export function normalizeByBook(book: Book, raw: unknown): NormalizedMarket[] {
  switch (book) {
    case "bovada":
      return normalizeBovadaMarkets(raw as never);
    case "novig":
      return normalizeNovigMarkets(raw as never);
    case "prophetx":
      return normalizeProphetXMarkets(raw as never);
    case "rebet":
      return normalizeRebetMarkets(raw as never);
    default:
      return [];
  }
}
export function toSerializable(rows: NormalizedMarket[]): Omit<NormalizedMarket, "raw">[] {
  return rows.map(({ raw: _raw, ...rest }) => rest);
}
