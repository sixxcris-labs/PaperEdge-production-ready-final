import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const dbPath = path.resolve(__dirname, "packages/database/prisma/dev.db");
const dbUrl = `file:${dbPath}`;

export default defineConfig({
  schema: "packages/database/prisma/schema.prisma",
  migrations: {
    path: "packages/database/prisma/migrations",
  },
  datasource: {
    url: dbUrl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: () => new PrismaBetterSqlite3({ url: dbUrl }),
  } as any,
});
