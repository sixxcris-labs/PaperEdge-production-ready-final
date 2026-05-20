import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listSourceFiles(relativeDir: string): string[] {
  const root = path.join(repoRoot, relativeDir);
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.[cm]?[tj]sx?$/.test(entry.name)) {
        files.push(path.relative(repoRoot, fullPath));
      }
    }
  }

  walk(root);
  return files.sort();
}

describe("Step 2 workspace skeleton", () => {
  it("declares app and package workspaces at the repo root", () => {
    const pkg = readJson<{ workspaces?: string[] }>("package.json");

    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
  });

  it("provides shared core and database package entrypoints", () => {
    const corePkg = readJson<{ name?: string; exports?: Record<string, string> }>(
      "packages/core/package.json",
    );
    const databasePkg = readJson<{ name?: string; exports?: Record<string, string> }>(
      "packages/database/package.json",
    );

    expect(corePkg.name).toBe("@paperedge/core");
    expect(corePkg.exports?.["."]).toBe("./src/index.ts");
    expect(databasePkg.name).toBe("@paperedge/database");
    expect(databasePkg.exports?.["."]).toBe("./src/index.ts");
    expect(readText("packages/database/src/index.ts")).toContain("export const db");
  });

  it("creates dashboard and verifier app shells that import shared packages", () => {
    for (const appName of ["dashboard", "verifier"]) {
      const appDir = `apps/${appName}`;

      expect(existsSync(path.join(repoRoot, appDir, "app/page.tsx"))).toBe(true);
      expect(existsSync(path.join(repoRoot, appDir, "app/layout.tsx"))).toBe(true);
      expect(readText(`${appDir}/app/page.tsx`)).toContain("@paperedge/core");
      expect(readText(`${appDir}/app/page.tsx`)).toContain("@paperedge/database");
    }
  });
});

describe("Step 3 shared package migration", () => {
  const coreModules = [
    "calc",
    "status",
    "trade-metrics",
    "dashboard-series",
    "checklist",
    "calculator-router",
    "verify",
    "fmt",
    "constants",
    "import-settlement",
    "opportunity-parser",
    "verification-analytics",
  ];

  it("moves shared core modules out of root lib into packages/core/src", () => {
    for (const moduleName of coreModules) {
      expect(
        existsSync(path.join(repoRoot, "packages/core/src", `${moduleName}.ts`)),
        `${moduleName} should exist in packages/core/src`,
      ).toBe(true);
      expect(
        existsSync(path.join(repoRoot, "lib", `${moduleName}.ts`)),
        `${moduleName} should no longer exist in root lib`,
      ).toBe(false);
    }
  });

  it("moves shared core tests into packages/core/src", () => {
    for (const testName of [
      "calc.test",
      "status.test",
      "trade-metrics.test",
      "dashboard-series.test",
      "import-settlement.test",
      "opportunity-parser.test",
      "verification-analytics.test",
      "calculator-router.test",
    ]) {
      expect(
        existsSync(path.join(repoRoot, "packages/core/src", `${testName}.ts`)),
        `${testName} should exist in packages/core/src`,
      ).toBe(true);
      expect(
        existsSync(path.join(repoRoot, "lib", `${testName}.ts`)),
        `${testName} should no longer exist in root lib`,
      ).toBe(false);
    }
  });

  it("moves Prisma and db ownership into packages/database", () => {
    expect(existsSync(path.join(repoRoot, "packages/database/prisma/schema.prisma"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/database/src/index.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "prisma/schema.prisma"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "lib/db.ts"))).toBe(false);
  });

  it("keeps root lib limited to app-specific helpers and workspace tests", () => {
    const rootLibFiles = readdirSync(path.join(repoRoot, "lib"))
      .filter((name) => name.endsWith(".ts"))
      .sort();

    expect(rootLibFiles).toEqual([
      "book-form.test.ts",
      "book-form.ts",
      "deep-links.ts",
      "lock-opportunity.ts",
      "opportunity-service.ts",
      "utils.ts",
      "workspace-structure.test.ts",
    ]);
  });

  it("uses workspace package imports instead of server-relative shared imports", () => {
    const offenders = listSourceFiles("app")
      .concat(listSourceFiles("components"))
      .filter((file) => /from\s+["']\/(?:core|database)(?:\/[^"']*)?["']/.test(readText(file)));

    expect(offenders).toEqual([]);
  });
});
