import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, "packages/database/prisma/schema.prisma"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate PaperEdge repo root from ${startDir}`);
    }

    current = parent;
  }
}

export function getDatabaseFilePath(): string {
  if (process.env.PAPEREDGE_DATABASE_PATH?.trim()) {
    return path.resolve(process.env.PAPEREDGE_DATABASE_PATH.trim());
  }

  return path.join(findRepoRoot(process.cwd()), "packages/database/prisma/dev.db");
}

const globalForPrisma = globalThis as unknown as { paperedgePrisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${getDatabaseFilePath()}` }),
  });
}

export function getDbClient(): PrismaClient {
  if (!globalForPrisma.paperedgePrisma) {
    globalForPrisma.paperedgePrisma = createClient();
  }

  return globalForPrisma.paperedgePrisma;
}

export async function disconnectDb(): Promise<void> {
  await globalForPrisma.paperedgePrisma?.$disconnect();
  globalForPrisma.paperedgePrisma = undefined;
}

/**
 * Lazily resolves the Prisma client. Next build imports route modules while
 * collecting metadata; opening better-sqlite3 at import time can hold native
 * handles open and leave the build process waiting even after compilation.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDbClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getDbClient()) : value;
  },
});
