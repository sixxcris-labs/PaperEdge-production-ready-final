import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

type LatestJsonInputOptions = {
  repoRoot: string;
  bookDirName: string;
  fallbackFileName: string;
};

export function resolveLatestJsonInput(options: LatestJsonInputOptions): string {
  const { repoRoot, bookDirName, fallbackFileName } = options;
  const bookDir = resolve(repoRoot, "raw_data", bookDirName);
  const fallback = resolve(repoRoot, "raw_data", fallbackFileName);

  if (!existsSync(bookDir)) return fallback;

  const newest = readdirSync(bookDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const fullPath = resolve(bookDir, name);
      const mtime = statSync(fullPath).mtimeMs;
      return { fullPath, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];

  return newest?.fullPath ?? fallback;
}
