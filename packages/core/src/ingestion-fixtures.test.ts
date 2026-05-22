import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeBovadaMarkets } from "./adapters/bovada";
import { normalizeNovigMarkets } from "./adapters/novig";
import { normalizeProphetXMarkets } from "./adapters/prophetx";
import type { NormalizedMarket } from "./market-normalization";
import { validateNormalizedRows } from "./normalized-market.schema";

/**
 * Integration guard for the ingestion pipeline: every captured sample under
 * raw_data/fixtures/** must flow through its adapter and emit schema-valid rows.
 * Drop new captures (props, totals, other sports/books) into that tree and they
 * are automatically exercised here. Runs as part of `npm test` -> `npm run validate`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const FIXTURES_DIR = resolve(repoRoot, "raw_data", "fixtures");

function bookOf(file: string): "bovada" | "novig" | "prophetx" | null {
  const n = file.toLowerCase();
  if (n.includes("bovada")) return "bovada";
  if (n.includes("novig")) return "novig";
  if (n.includes("prophet")) return "prophetx";
  return null;
}

function normalize(book: "bovada" | "novig" | "prophetx", raw: unknown): NormalizedMarket[] {
  if (book === "bovada") return normalizeBovadaMarkets(raw as never);
  if (book === "novig") return normalizeNovigMarkets(raw as never);
  return normalizeProphetXMarkets(raw as never);
}

function collect(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".json")) out.push(full);
  }
  return out;
}

const fixtures = collect(FIXTURES_DIR);

describe("ingestion fixtures", () => {
  if (fixtures.length === 0) {
    it("no fixtures present yet (drop captures in raw_data/fixtures/**)", () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const file of fixtures) {
    const rel = relative(repoRoot, file);
    const book = bookOf(file);

    it(`${rel} resolves to a known book`, () => {
      expect(book).not.toBeNull();
    });
    if (!book) continue;

    it(`${rel} normalizes to schema-valid rows`, () => {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const rows = normalize(book, raw);
      expect(rows.length).toBeGreaterThan(0);

      const flat = rows.map(({ raw: _raw, ...rest }) => rest);
      const result = validateNormalizedRows(flat);
      if (!result.valid) {
        // surface the first few issues in the failure message
        const detail = result.issues.slice(0, 5).map((i) => `row ${i.index}.${i.field}: ${i.message}`).join("; ");
        throw new Error(`${rel} produced ${result.issues.length} schema issue(s): ${detail}`);
      }
      expect(result.valid).toBe(true);
    });
  }
});
