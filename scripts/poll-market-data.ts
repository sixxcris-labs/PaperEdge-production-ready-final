import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBovadaMarkets } from "../packages/core/src/adapters/bovada";
import { normalizeFourCMarkets } from "../packages/core/src/adapters/fourc";
import { normalizeNovigMarkets } from "../packages/core/src/adapters/novig";
import { normalizeProphetXMarkets } from "../packages/core/src/adapters/prophetx";
import { normalizeRebetMarkets } from "../packages/core/src/adapters/rebet";
import type { MarketSource, NormalizedMarket } from "../packages/core/src/market-normalization";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

type ScannerBook = Extract<MarketSource, "bovada" | "novig" | "4c" | "rebet" | "prophetx">;

type OutputDirectories = {
  rawData?: string;
  normalizedData?: string;
  logs?: string;
};

type MarketRequest = {
  id?: string;
  url?: string;
  filePath?: string;
  eventId?: string;
  marketId?: string;
  eventName?: string;
  marketType?: string;
  period?: string;
  sport?: string;
  league?: string;
  live?: boolean;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  normalize?: boolean;
};

type BookConfig = {
  enabled?: boolean;
  baseUrl?: string;
  eventUrlTemplate?: string;
  headers?: Record<string, string>;
  requests?: MarketRequest[];
};

type ScannerConfig = {
  enabledBooks?: ScannerBook[];
  enabled_books?: ScannerBook[];
  sport?: string;
  league?: string;
  pollIntervalSeconds?: number;
  poll_interval_seconds?: number;
  outputDirectories?: OutputDirectories;
  output_directories?: OutputDirectories;
  books?: Partial<Record<ScannerBook, BookConfig>>;
};

type RequestLogEntry = {
  timestamp: string;
  source: ScannerBook | "scanner";
  requestId: string | null;
  requestUrl: string | null;
  requestFilePath?: string | null;
  eventId: string | null;
  marketId: string | null;
  requestStatus: number | "not_sent" | "not_modified" | "error" | "local_file";
  rawOutputPath?: string;
  normalizedOutputPath?: string;
  rawBytes: number;
  normalizedRowsWritten: number;
  error?: string;
};

type CacheState = Record<string, string>;

const DEFAULT_CONFIG: ScannerConfig = {
  enabledBooks: ["bovada", "novig", "4c", "rebet", "prophetx"],
  sport: "basketball",
  league: "nba",
  pollIntervalSeconds: 30,
  outputDirectories: {
    rawData: "raw_data",
    normalizedData: "normalized_data",
    logs: "logs",
  },
  books: {
    bovada: { enabled: true, requests: [] },
    novig: { enabled: true, requests: [] },
    "4c": { enabled: false, requests: [] },
    rebet: { enabled: false, requests: [] },
    prophetx: { enabled: false, requests: [] },
  },
};

function argValue(args: string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return null;
}

function hasArg(args: string[], name: string): boolean {
  return args.includes(name);
}

function loadConfig(configPath: string): ScannerConfig {
  if (!existsSync(configPath)) throw new Error(`Config file not found: ${configPath}`);
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as ScannerConfig;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    outputDirectories: {
      ...DEFAULT_CONFIG.outputDirectories,
      ...(parsed.outputDirectories ?? parsed.output_directories ?? {}),
    },
    books: {
      ...DEFAULT_CONFIG.books,
      ...(parsed.books ?? {}),
    },
  };
}

function enabledBooks(config: ScannerConfig): ScannerBook[] {
  const explicit = config.enabledBooks ?? config.enabled_books;
  const books = explicit && explicit.length > 0 ? explicit : (["bovada", "novig", "4c", "rebet", "prophetx"] as ScannerBook[]);
  return books.filter((book) => config.books?.[book]?.enabled !== false);
}

function outputDir(config: ScannerConfig, key: keyof OutputDirectories): string {
  const dirs = config.outputDirectories ?? config.output_directories ?? {};
  return resolve(repoRoot, dirs[key] ?? DEFAULT_CONFIG.outputDirectories![key]!);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "request";
}

function timestampForPath(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function resolveRequestFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (/^[A-Za-z]:\\/.test(trimmed)) {
    const drive = trimmed[0].toLowerCase();
    const rest = trimmed.slice(2).replace(/\\/g, "/");
    return `/mnt/${drive}${rest}`;
  }
  if (trimmed.startsWith("/")) return trimmed;
  return resolve(repoRoot, trimmed);
}

function resolveRequestUrl(bookConfig: BookConfig, request: MarketRequest): string | null {
  if (request.url) return request.url;
  if (!request.eventId || !bookConfig.eventUrlTemplate) return null;

  const rendered = bookConfig.eventUrlTemplate
    .replace(/\{eventId\}/g, encodeURIComponent(request.eventId))
    .replace(/\{marketId\}/g, encodeURIComponent(request.marketId ?? ""));

  if (/^https?:\/\//i.test(rendered)) return rendered;
  if (!bookConfig.baseUrl) return rendered;
  return `${bookConfig.baseUrl.replace(/\/$/, "")}/${rendered.replace(/^\//, "")}`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function appendJsonl(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}

function readCache(cachePath: string): CacheState {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf8")) as CacheState;
  } catch {
    return {};
  }
}

function writeCache(cachePath: string, cache: CacheState): void {
  writeJson(cachePath, cache);
}

function normalizeRows(source: ScannerBook, raw: unknown, request: MarketRequest, config: ScannerConfig, receivedAt: string): NormalizedMarket[] {
  if (request.normalize === false) return [];

  switch (source) {
    case "bovada":
      return normalizeBovadaMarkets(raw, {
        sport: request.sport ?? config.sport,
        league: request.league ?? config.league,
        receivedAt,
      });
    case "novig":
      return normalizeNovigMarkets(raw, {
        sport: request.sport ?? config.sport,
        league: request.league ?? config.league,
        eventName: request.eventName,
        eventId: request.eventId,
        marketType: request.marketType,
        period: request.period,
        live: request.live,
        receivedAt,
      });
    case "4c":
      return normalizeFourCMarkets(raw);
    case "rebet":
      return normalizeRebetMarkets(raw);
    case "prophetx":
      return normalizeProphetXMarkets(raw);
    default:
      return [];
  }
}

async function scanRequest(
  source: ScannerBook,
  bookConfig: BookConfig,
  request: MarketRequest,
  config: ScannerConfig,
  cache: CacheState,
): Promise<{ rows: NormalizedMarket[]; log: RequestLogEntry }> {
  const timestamp = new Date().toISOString();
  const requestFilePath = request.filePath ? resolveRequestFilePath(request.filePath) : null;
  const requestUrl = resolveRequestUrl(bookConfig, request);
  const requestId = slug(request.id ?? request.marketId ?? request.eventId ?? requestUrl ?? "request");
  const pathTimestamp = timestampForPath(timestamp);
  const rawPath = resolve(outputDir(config, "rawData"), source, `${pathTimestamp}_${requestId}.json`);
  const normalizedPath = resolve(outputDir(config, "normalizedData"), source, `${pathTimestamp}_${requestId}.jsonl`);

  if (requestFilePath) {
    if (!existsSync(requestFilePath)) {
      return {
        rows: [],
        log: {
          timestamp,
          source,
          requestId,
          requestUrl: null,
          requestFilePath,
          eventId: request.eventId ?? null,
          marketId: request.marketId ?? null,
          requestStatus: "error",
          rawBytes: 0,
          normalizedRowsWritten: 0,
          error: `Local file not found: ${requestFilePath}`,
        },
      };
    }

    const text = readFileSync(requestFilePath, "utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { text };
    }

    const rows = normalizeRows(source, raw, request, config, timestamp);
    return {
      rows,
      log: {
        timestamp,
        source,
        requestId,
        requestUrl: null,
        requestFilePath,
        eventId: request.eventId ?? null,
        marketId: request.marketId ?? null,
        requestStatus: "local_file",
        rawBytes: Buffer.byteLength(text, "utf8"),
        normalizedRowsWritten: rows.length,
      },
    };
  }

  if (!requestUrl) {
    return {
      rows: [],
      log: {
        timestamp,
          source,
          requestId,
          requestUrl: null,
          requestFilePath: null,
          eventId: request.eventId ?? null,
          marketId: request.marketId ?? null,
          requestStatus: "not_sent",
        rawBytes: 0,
        normalizedRowsWritten: 0,
        error: "Request needs url or eventId plus eventUrlTemplate.",
      },
    };
  }

  const headers: Record<string, string> = {
    accept: "application/json,text/plain,*/*",
    ...(bookConfig.headers ?? {}),
    ...(request.headers ?? {}),
  };

  const previousEtag = cache[requestUrl];
  if (previousEtag && !headers["if-none-match"] && !headers["If-None-Match"]) {
    headers["if-none-match"] = previousEtag;
  }

  try {
    const response = await fetch(requestUrl, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });

    const etag = response.headers.get("etag");
    if (etag) cache[requestUrl] = etag;

    if (response.status === 304) {
      return {
        rows: [],
        log: {
          timestamp,
          source,
          requestId,
          requestUrl,
          requestFilePath: null,
          eventId: request.eventId ?? null,
          marketId: request.marketId ?? null,
          requestStatus: "not_modified",
          rawBytes: 0,
          normalizedRowsWritten: 0,
        },
      };
    }

    const text = await response.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { text };
    }

    writeJson(rawPath, raw);
    const rows = response.ok ? normalizeRows(source, raw, request, config, timestamp) : [];
    writeJsonl(normalizedPath, rows);

    return {
      rows,
      log: {
        timestamp,
        source,
        requestId,
        requestUrl,
        requestFilePath: null,
        eventId: request.eventId ?? null,
        marketId: request.marketId ?? null,
        requestStatus: response.status,
        rawOutputPath: rawPath,
        normalizedOutputPath: normalizedPath,
        rawBytes: Buffer.byteLength(text, "utf8"),
        normalizedRowsWritten: rows.length,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      },
    };
  } catch (error) {
    return {
      rows: [],
      log: {
        timestamp,
        source,
        requestId,
        requestUrl,
        requestFilePath: null,
        eventId: request.eventId ?? null,
        marketId: request.marketId ?? null,
        requestStatus: "error",
        rawBytes: 0,
        normalizedRowsWritten: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function runCycle(config: ScannerConfig): Promise<void> {
  const normalizedDir = outputDir(config, "normalizedData");
  const logsDir = outputDir(config, "logs");
  ensureDir(normalizedDir);
  ensureDir(logsDir);

  const logPath = resolve(logsDir, "market_data_poll_log.jsonl");
  const cachePath = resolve(logsDir, "market_data_etags.json");
  const cache = readCache(cachePath);
  const allRows: NormalizedMarket[] = [];
  const rowsByBook = new Map<ScannerBook, NormalizedMarket[]>();

  for (const source of enabledBooks(config)) {
    const bookConfig = config.books?.[source] ?? { enabled: true, requests: [] };
    const requests = bookConfig.requests ?? [];

    if (requests.length === 0) {
      appendJsonl(logPath, {
        timestamp: new Date().toISOString(),
        source,
        requestId: null,
        requestUrl: null,
        requestFilePath: null,
        eventId: null,
        marketId: null,
        requestStatus: "not_sent",
        rawBytes: 0,
        normalizedRowsWritten: 0,
        error: "No requests configured for source.",
      } satisfies RequestLogEntry);
      continue;
    }

    for (const request of requests) {
      const result = await scanRequest(source, bookConfig, request, config, cache);
      appendJsonl(logPath, result.log);
      allRows.push(...result.rows);
      rowsByBook.set(source, [...(rowsByBook.get(source) ?? []), ...result.rows]);
    }
  }

  for (const [source, rows] of rowsByBook.entries()) {
    writeJsonl(resolve(normalizedDir, `${source}_normalized.jsonl`), rows);
  }
  writeJsonl(resolve(normalizedDir, "scanner_normalized.jsonl"), allRows);

  appendJsonl(logPath, {
    timestamp: new Date().toISOString(),
    source: "scanner",
    requestId: "cycle-summary",
    requestUrl: null,
    requestFilePath: null,
    eventId: null,
    marketId: null,
    requestStatus: 200,
    rawBytes: 0,
    normalizedRowsWritten: allRows.length,
  } satisfies RequestLogEntry);

  writeCache(cachePath, cache);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configPath = resolve(repoRoot, argValue(args, "--config") ?? "config/paperedge.scanner.config.json");
  const once = hasArg(args, "--once");
  const config = loadConfig(configPath);
  const intervalSeconds = Number(config.pollIntervalSeconds ?? config.poll_interval_seconds ?? DEFAULT_CONFIG.pollIntervalSeconds);

  await runCycle(config);
  if (once) return;

  setInterval(() => {
    runCycle(config).catch((error) => {
      const logsDir = outputDir(config, "logs");
      appendJsonl(resolve(logsDir, "market_data_poll_log.jsonl"), {
        timestamp: new Date().toISOString(),
        source: "scanner",
        requestId: "cycle-error",
        requestUrl: null,
        requestFilePath: null,
        eventId: null,
        marketId: null,
        requestStatus: "error",
        rawBytes: 0,
        normalizedRowsWritten: 0,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RequestLogEntry);
    });
  }, Math.max(1, intervalSeconds) * 1000);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
