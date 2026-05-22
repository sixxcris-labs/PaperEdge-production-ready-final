import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

type LogEntry = {
  timestamp?: string;
  source?: string;
  requestId?: string;
  requestStatus?: number | string;
  normalizedRowsWritten?: number;
  requestUrl?: string | null;
  requestFilePath?: string | null;
};

type SourceSummary = {
  source: string;
  requests: number;
  ok: number;
  failed: number;
  rows: number;
};

function argValue(args: string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return null;
}

function parseJsonl(path: string): LogEntry[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: LogEntry[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as LogEntry);
    } catch {
      // Skip malformed lines so one bad write does not hide the full report.
    }
  }
  return rows;
}

function isOkStatus(entry: LogEntry): boolean {
  const status = entry.requestStatus;
  if (status === 200 || status === "local_file") return true;
  return false;
}

function selectLatestCycle(entries: LogEntry[]): LogEntry[] {
  const cycleIndices = entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => entry.requestId === "cycle-summary" && entry.source === "scanner")
    .map(({ idx }) => idx);

  if (cycleIndices.length === 0) return entries;
  const last = cycleIndices[cycleIndices.length - 1];
  const prev = cycleIndices.length > 1 ? cycleIndices[cycleIndices.length - 2] : -1;
  return entries.slice(prev + 1, last + 1);
}

function summarizeBySource(entries: LogEntry[]): SourceSummary[] {
  const bySource = new Map<string, SourceSummary>();
  for (const entry of entries) {
    const source = entry.source ?? "unknown";
    if (source === "scanner") continue;
    const current = bySource.get(source) ?? { source, requests: 0, ok: 0, failed: 0, rows: 0 };
    current.requests += 1;
    current.rows += Number(entry.normalizedRowsWritten ?? 0);
    if (isOkStatus(entry)) current.ok += 1;
    else current.failed += 1;
    bySource.set(source, current);
  }
  return [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
}

function printSourceTable(summary: SourceSummary[]): void {
  if (summary.length === 0) {
    console.log("No source data found in selected cycle.");
    return;
  }

  const header = [
    "source".padEnd(10),
    "requests".padStart(8),
    "ok".padStart(5),
    "failed".padStart(8),
    "rows".padStart(8),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of summary) {
    console.log(
      [
        row.source.padEnd(10),
        String(row.requests).padStart(8),
        String(row.ok).padStart(5),
        String(row.failed).padStart(8),
        String(row.rows).padStart(8),
      ].join(" "),
    );
  }
}

function printFailures(entries: LogEntry[]): void {
  const failures = entries.filter((entry) => entry.source !== "scanner" && !isOkStatus(entry));
  if (failures.length === 0) {
    console.log("\nFailures: none");
    return;
  }

  console.log("\nFailures:");
  for (const failure of failures) {
    const target = failure.requestUrl ?? failure.requestFilePath ?? "n/a";
    console.log(
      `- ${failure.source ?? "unknown"} / ${failure.requestId ?? "unknown"} ` +
        `status=${String(failure.requestStatus)} rows=${String(failure.normalizedRowsWritten ?? 0)} target=${target}`,
    );
  }
}

function countMergedRows(repoRoot: string): Array<{ file: string; rows: number; mtime: string }> {
  const dir = resolve(repoRoot, "normalized_data");
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith("_normalized.jsonl"))
    .map((name) => {
      const fullPath = resolve(dir, name);
      const raw = readFileSync(fullPath, "utf8");
      const rows = raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
      const mtime = statSync(fullPath).mtime.toISOString();
      return { file: name, rows, mtime };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

function printMergedRows(rows: Array<{ file: string; rows: number; mtime: string }>): void {
  if (rows.length === 0) {
    console.log("\nNo merged normalized files found.");
    return;
  }
  console.log("\nMerged normalized files:");
  for (const row of rows) {
    console.log(`- ${row.file}: ${row.rows} rows (updated ${row.mtime})`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const repoRoot = resolve(argValue(args, "--repo-root") ?? ".");
  const logPath = resolve(argValue(args, "--log") ?? "logs/market_data_poll_log.jsonl");

  const entries = parseJsonl(logPath);
  const latestCycle = selectLatestCycle(entries);
  const summaries = summarizeBySource(latestCycle);

  console.log(`Scan summary from ${basename(logPath)} (${latestCycle.length} log rows in selected cycle)\n`);
  printSourceTable(summaries);
  printFailures(latestCycle);
  printMergedRows(countMergedRows(repoRoot));
}

main();
