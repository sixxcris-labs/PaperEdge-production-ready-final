import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { normalizeBovadaMarkets } from "../packages/core/src/adapters/bovada";
import { normalizeNovigMarkets } from "../packages/core/src/adapters/novig";
import { detectEdgeSignals } from "../packages/core/src/edge-signal-engine";
import { edgeSignalsToReviewItems } from "../packages/core/src/edge-signal-import";
import { validateNormalizedRows } from "../packages/core/src/normalized-market.schema";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
type PollBook = "bovada" | "novig";
type RequestConfig = {
  id?: string;
  url?: string;
  urlTemplate?: string;
  eventName?: string;
  eventId?: string;
  marketId?: string;
  sport?: string;
  league?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
};
type BookConfig = {
  enabled?: boolean;
  baseUrl?: string;
  urlTemplate?: string;
  headers?: Record<string, string>;
  requests?: RequestConfig[];
  eventIds?: string[];
  marketIds?: string[];
};
type PollerConfig = {
  enabledBooks?: PollBook[];
  sport?: string;
  league?: string;
  pollIntervalSeconds?: number;
  outputDirectories?: {
    raw?: string;
    normalized?: string;
    logs?: string;
  };
  detection?: {
    maxFreshnessSeconds?: number;
    signalsFile?: string;
    reviewFile?: string;
  };
  books?: Partial<Record<PollBook, BookConfig>>;
};
type PollLogEvent = {
  timestamp: string;
  source: PollBook | "engine";
  requestUrl?: string;
  marketId?: string;
  requestStatus?: number | string;
  marketsParsed?: number;
  normalizedRowsWritten?: number;
  rawPath?: string;
  normalizedPath?: string;
  errors?: string[];
};
function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function loadConfig(path: string): PollerConfig {
  const resolved = resolve(repoRoot, path);
  return JSON.parse(readFileSync(resolved, "utf8")) as PollerConfig;
}
function outputDir(config: PollerConfig, key: "raw" | "normalized" | "logs", fallback: string): string {
  return resolve(repoRoot, config.outputDirectories?.[key] ?? fallback);
}
function safePart(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? "").toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}
function resolveRequestUrl(bookConfig: BookConfig, request: RequestConfig, globalConfig: PollerConfig): string | null {
  if (request.url) return request.url;
  const id = request.id ?? request.eventId ?? request.marketId;
  const template = request.urlTemplate ?? bookConfig.urlTemplate;
  if (template && id) {
    return template
      .replace(/\{id\}/g, encodeURIComponent(id))
      .replace(/\{eventId\}/g, encodeURIComponent(request.eventId ?? request.id ?? id))
      .replace(/\{marketId\}/g, encodeURIComponent(request.marketId ?? request.id ?? id))
      .replace(/\{sport\}/g, encodeURIComponent(request.sport ?? globalConfig.sport ?? ""))
      .replace(/\{league\}/g, encodeURIComponent(request.league ?? globalConfig.league ?? ""));
  }
  if (bookConfig.baseUrl && id) return `${bookConfig.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(id)}`;
  return null;
}
function expandRequests(bookConfig: BookConfig): RequestConfig[] {
  const explicit = bookConfig.requests ?? [];
  const eventRequests = (bookConfig.eventIds ?? []).map((eventId) => ({ eventId, id: eventId }));
  const marketRequests = (bookConfig.marketIds ?? []).map((marketId) => ({ marketId, id: marketId }));
  return [...explicit, ...eventRequests, ...marketRequests];
}
async function fetchJson(requestUrl: string, request: RequestConfig, bookConfig: BookConfig): Promise<{ status: number; body: unknown; text: string }> {
  const method = request.method ?? "GET";
  const headers = { ...(bookConfig.headers ?? {}), ...(request.headers ?? {}) };
  const init: RequestInit = { method, headers };
  if (request.body !== undefined) {
    init.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }
  const response = await fetch(requestUrl, init);
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { text };
  }
  return { status: response.status, body, text };
}
function normalizeForBook(book: PollBook, raw: unknown, request: RequestConfig, config: PollerConfig, receivedAt: string): NormalizedMarket[] {
  const options = {
    sport: request.sport ?? config.sport,
    league: request.league ?? config.league,
    eventName: request.eventName,
    eventId: request.eventId ?? request.id,
    receivedAt,
  };
  if (book === "bovada") return normalizeBovadaMarkets(raw, options);
  return normalizeNovigMarkets(raw, options);
}
function serializableRows(rows: NormalizedMarket[]): Omit<NormalizedMarket, "raw">[] {
  return rows.map(({ raw: _raw, ...row }) => row);
}
function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}
function appendLog(logPath: string, event: PollLogEvent): void {
  mkdirSync(dirname(logPath), { recursive: true });
  const line = JSON.stringify(event);
  appendFileSync(logPath, `${line}\n`, "utf8");
  console.log(line);
}
function marketsParsed(rows: NormalizedMarket[]): number {
  return new Set(rows.map((row) => `${row.sourceEventId ?? row.event_id}::${row.sourceMarketId ?? row.market_type}`)).size;
}
async function pollBook(book: PollBook, config: PollerConfig, cycleStartedAt: string, logPath: string): Promise<NormalizedMarket[]> {
  const bookConfig = config.books?.[book] ?? {};
  if (bookConfig.enabled === false) return [];
  const requests = expandRequests(bookConfig);
  const rawDir = outputDir(config, "raw", "raw_data");
  const normalizedDir = outputDir(config, "normalized", "normalized_data");
  const allRows: NormalizedMarket[] = [];
  if (requests.length === 0) {
    appendLog(logPath, {
      timestamp: new Date().toISOString(),
      source: book,
      requestStatus: "skipped",
      errors: [`No requests configured for ${book}. Add requests, eventIds, or marketIds.`],
    });
    return allRows;
  }
  for (const request of requests) {
    const url = resolveRequestUrl(bookConfig, request, config);
    const eventOrMarketId = request.eventId ?? request.marketId ?? request.id;
    if (!url) {
      appendLog(logPath, {
        timestamp: new Date().toISOString(),
        source: book,
        marketId: eventOrMarketId,
        requestStatus: "skipped",
        errors: ["Missing URL. Provide request.url, request.urlTemplate, book.urlTemplate, or book.baseUrl plus an ID."],
      });
      continue;
    }
    try {
      const fetched = await fetchJson(url, request, bookConfig);
      const rawName = `${stamp()}_${safePart(config.sport, "sport")}_${safePart(config.league, "league")}_${safePart(eventOrMarketId, hashText(url))}.json`;
      const rawPath = join(rawDir, book, rawName);
      mkdirSync(dirname(rawPath), { recursive: true });
      writeFileSync(rawPath, JSON.stringify(fetched.body, null, 2), "utf8");
      const rows = normalizeForBook(book, fetched.body, request, config, cycleStartedAt);
      const normalized = serializableRows(rows);
      const validation = validateNormalizedRows(normalized);
      const normalizedPath = join(normalizedDir, book, rawName.replace(/\.json$/, ".jsonl"));
      if (validation.valid) {
        writeJsonl(normalizedPath, normalized);
        allRows.push(...rows);
      }
      appendLog(logPath, {
        timestamp: new Date().toISOString(),
        source: book,
        requestUrl: url,
        marketId: eventOrMarketId,
        requestStatus: fetched.status,
        marketsParsed: marketsParsed(rows),
        normalizedRowsWritten: validation.valid ? normalized.length : 0,
        rawPath: relative(repoRoot, rawPath),
        normalizedPath: validation.valid ? relative(repoRoot, normalizedPath) : undefined,
        errors: validation.valid ? undefined : validation.issues.slice(0, 8).map((issue) => `row ${issue.index}.${issue.field}: ${issue.message}`),
      });
    } catch (err) {
      appendLog(logPath, {
        timestamp: new Date().toISOString(),
        source: book,
        requestUrl: url,
        marketId: eventOrMarketId,
        requestStatus: "error",
        errors: [(err as Error).message],
      });
    }
  }
  const aggregatePath = join(normalizedDir, `${book}_normalized.jsonl`);
  writeJsonl(aggregatePath, serializableRows(allRows));
  return allRows;
}
function runDetection(config: PollerConfig, rows: NormalizedMarket[], cycleStartedAt: string, logPath: string): void {
  const normalizedDir = outputDir(config, "normalized", "normalized_data");
  const signalsPath = join(normalizedDir, config.detection?.signalsFile ?? "edge_signals.jsonl");
  const reviewPath = join(normalizedDir, config.detection?.reviewFile ?? "review_candidates.jsonl");
  const signals = detectEdgeSignals(rows, {
    createdAt: cycleStartedAt,
    maxFreshnessSeconds: config.detection?.maxFreshnessSeconds ?? Math.max(config.pollIntervalSeconds ?? 30, 30),
  });
  const reviewItems = edgeSignalsToReviewItems(signals);
  writeJsonl(signalsPath, signals);
  writeJsonl(reviewPath, reviewItems);
  appendLog(logPath, {
    timestamp: new Date().toISOString(),
    source: "engine",
    requestStatus: "ok",
    marketsParsed: new Set(rows.map((row) => `${row.event_id}::${row.market_type}::${row.player ?? ""}`)).size,
    normalizedRowsWritten: rows.length,
    normalizedPath: `${relative(repoRoot, signalsPath)}; ${relative(repoRoot, reviewPath)}`,
  });
}
async function runCycle(config: PollerConfig): Promise<void> {
  const cycleStartedAt = new Date().toISOString();
  const logPath = join(outputDir(config, "logs", "logs"), "poller.jsonl");
  const enabled = config.enabledBooks ?? (["bovada", "novig"] as PollBook[]);
  const rows: NormalizedMarket[] = [];
  for (const book of enabled) {
    if (book !== "bovada" && book !== "novig") continue;
    rows.push(...(await pollBook(book, config, cycleStartedAt, logPath)));
  }
  runDetection(config, rows, cycleStartedAt, logPath);
}
async function main(): Promise<void> {
  const configPath = argValue("config") ?? "config/paperedge.poller.config.json";
  const config = loadConfig(configPath);
  const once = hasFlag("once");
  if (once) {
    await runCycle(config);
    return;
  }
  const intervalMs = Math.max(config.pollIntervalSeconds ?? 30, 5) * 1000;
  await runCycle(config);
  setInterval(() => {
    runCycle(config).catch((err) => console.error(`[poller] cycle failed: ${(err as Error).message}`));
  }, intervalMs);
}
main().catch((err) => {
  console.error((err as Error).stack ?? (err as Error).message);
  process.exit(1);
});
