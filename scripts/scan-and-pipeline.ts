import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

type AutomationConfig = {
  pollIntervalSeconds?: number;
  poll_interval_seconds?: number;
  books?: Record<string, { enabled?: boolean; requests?: unknown[] }>;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function now(): string {
  return new Date().toISOString();
}

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function clearPath(path: string): void {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
}

function prepareCycleFilesystem(repoRoot: string): void {
  // Remove per-request scan artifacts from prior cycles.
  clearPath(resolve(repoRoot, "raw_data", "bovada"));
  clearPath(resolve(repoRoot, "raw_data", "novig"));
  clearPath(resolve(repoRoot, "raw_data", "4c"));
  clearPath(resolve(repoRoot, "raw_data", "rebet"));
  clearPath(resolve(repoRoot, "raw_data", "prophetx"));
  clearPath(resolve(repoRoot, "normalized_data", "bovada"));
  clearPath(resolve(repoRoot, "normalized_data", "novig"));
  clearPath(resolve(repoRoot, "normalized_data", "4c"));
  clearPath(resolve(repoRoot, "normalized_data", "rebet"));
  clearPath(resolve(repoRoot, "normalized_data", "prophetx"));
  clearPath(resolve(repoRoot, "normalized_data", "scanner_normalized.jsonl"));
  clearPath(resolve(repoRoot, "logs", "market_data_poll_log.jsonl"));
}

function archiveFinalComparisonOutputs(repoRoot: string): void {
  const timestamp = sanitizeTimestamp(now());
  const archiveDir = resolve(repoRoot, "archive", "final-comparison", timestamp);
  ensureDir(archiveDir);

  const files = [
    "normalized_data/book_comparison.csv",
    "normalized_data/cross_book_arbs.csv",
    "normalized_data/fair_value_edges.csv",
  ];

  let copied = 0;
  for (const relPath of files) {
    const source = resolve(repoRoot, relPath);
    if (!existsSync(source)) continue;
    const filename = relPath.split("/").at(-1);
    if (!filename) continue;
    copyFileSync(source, resolve(archiveDir, filename));
    copied += 1;
  }

  if (copied === 0) {
    clearPath(archiveDir);
    console.warn(`[${now()}] archive skipped: no final comparison files found.`);
    return;
  }

  console.log(`[${now()}] archive saved: ${archiveDir} (${copied} files)`);
}

function loadIntervalSeconds(configPath: string): number {
  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as AutomationConfig;
  const configured = parsed.pollIntervalSeconds ?? parsed.poll_interval_seconds;
  const n = Number(configured ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function loadAutomationConfig(configPath: string): AutomationConfig {
  const raw = readFileSync(configPath, "utf8");
  return JSON.parse(raw) as AutomationConfig;
}

function shouldRunFallbackNormalize(config: AutomationConfig, book: "4c" | "rebet" | "prophetx"): boolean {
  const bookConfig = config.books?.[book];
  if (!bookConfig) return true;
  const enabled = bookConfig.enabled !== false;
  const requestCount = bookConfig.requests?.length ?? 0;
  return !enabled || requestCount === 0;
}

async function runCmd(label: string, command: string, args: string[]): Promise<number> {
  console.log(`[${now()}] ${label}: ${command} ${args.join(" ")}`);

  return await new Promise<number>((resolveCode) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      console.error(`[${now()}] ${label} failed to start: ${error.message}`);
      resolveCode(1);
    });

    child.on("close", (code, signal) => {
      if (signal) {
        console.error(`[${now()}] ${label} exited by signal ${signal}`);
        resolveCode(1);
        return;
      }
      resolveCode(code ?? 1);
    });
  });
}

async function runScanCycle(configPath: string): Promise<boolean> {
  const repoRoot = resolve(configPath, "..", "..");
  const config = loadAutomationConfig(configPath);
  prepareCycleFilesystem(repoRoot);

  const scanCode = await runCmd(
    "scan",
    "node",
    ["--import", "tsx", "scripts/poll-market-data.ts", "--config", configPath, "--once"],
  );

  if (scanCode !== 0) {
    console.error(`[${now()}] scan failed (exit ${scanCode}); skipping downstream reports for this cycle.`);
    return false;
  }

  // Refresh non-polled books from local captured raw snapshots so every cycle
  // includes all sportsbook sources used by edge comparison.
  const refreshSteps: Array<{ label: string; args: string[]; enabled: boolean }> = [
    {
      label: "normalize:4c",
      args: ["--import", "tsx", "scripts/normalize-4c.ts"],
      enabled: shouldRunFallbackNormalize(config, "4c"),
    },
    {
      label: "normalize:rebet",
      args: ["--import", "tsx", "scripts/normalize-rebet.ts"],
      enabled: shouldRunFallbackNormalize(config, "rebet"),
    },
    {
      label: "normalize:prophetx",
      args: ["--import", "tsx", "scripts/normalize-prophetx.ts"],
      enabled: shouldRunFallbackNormalize(config, "prophetx"),
    },
  ];

  for (const step of refreshSteps) {
    if (!step.enabled) continue;
    const code = await runCmd(step.label, "node", step.args);
    if (code !== 0) {
      console.error(`[${now()}] ${step.label} failed (exit ${code}).`);
      return false;
    }
  }

  const steps: Array<{ label: string; args: string[] }> = [
    { label: "detect:edges", args: ["--import", "tsx", "scripts/detect-edges.ts"] },
    { label: "compare:books", args: ["--import", "tsx", "scripts/compare-books.ts"] },
    { label: "edges:arbs", args: ["--import", "tsx", "scripts/arbs-report.ts"] },
    { label: "edges:fairvalue", args: ["--import", "tsx", "scripts/fair-value-report.ts"] },
  ];

  let ok = true;
  for (const step of steps) {
    const code = await runCmd(step.label, "node", step.args);
    if (code !== 0) {
      console.error(`[${now()}] ${step.label} failed (exit ${code}).`);
      ok = false;
    }
  }

  if (ok) {
    archiveFinalComparisonOutputs(repoRoot);
    console.log(`[${now()}] cycle complete: scan + downstream reports succeeded.`);
  } else {
    console.warn(`[${now()}] cycle complete: scan succeeded, one or more downstream reports failed.`);
  }

  return ok;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = hasArg(args, "--once");
  const configPath = resolve(argValue(args, "--config") ?? "config/paperedge.scanner.config.json");
  const intervalSeconds = loadIntervalSeconds(configPath);

  console.log(`[${now()}] automation start: config=${configPath} interval=${intervalSeconds}s once=${once}`);

  await runScanCycle(configPath);
  if (once) return;

  while (true) {
    await sleep(intervalSeconds * 1000);
    await runScanCycle(configPath);
  }
}

main().catch((error) => {
  console.error(`[${now()}] automation crashed:`, error);
  process.exitCode = 1;
});
