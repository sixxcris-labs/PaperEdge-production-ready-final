import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "bookmap.db");
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name      TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

function runMigrations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((r: any) => r.name as string),
  );

  const insertApplied = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      insertApplied.run(file);
    });
    tx();
    console.log(`[db] applied migration: ${file}`);
  }
}

runMigrations();
