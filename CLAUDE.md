# PaperEdge — Agent Operating Rules

Full agent guide: **[AGENTS.md](AGENTS.md)**. Read it before non-trivial work.

## 🛑 HARD RULE: Native Windows only — never WSL

PaperEdge runs on **native Windows**. The Windows dashboard (Next.js +
`better-sqlite3` native addon) and a WSL/Linux toolchain **cannot share one
`node_modules`** — switching between them silently breaks data capture and the
database. This split has already caused two production failures. Do not
reintroduce it.

**Always:**
- Run every Node/npm/tsx/prisma/vitest/next command from **PowerShell** (the
  PowerShell tool) — native Windows. Git Bash is fine for `git` only.
- Use **repo-relative paths** in configs, scripts, and commands
  (e.g. `raw_data/novig_marketNBA.json`).

**Never:**
- `wsl`, `wsl bash`, or running project tooling from a WSL shell.
- `TMPDIR=/tmp`, `/tmp/...`, `/mnt/c/...`, or any POSIX absolute path.
- Absolute Windows paths (`C:\Users\...`) hard-coded in committed configs.
- `npm install` / `npm rebuild` from WSL — it compiles `better-sqlite3` as a
  Linux ELF, and the dashboard then throws *"not a valid Win32 application"* on
  every DB page.

**If a DB page errors with "not a valid Win32 application":** the native addon
was built for the wrong platform. Fix from PowerShell: `npm rebuild better-sqlite3`.

See [docs/PLATFORM.md](docs/PLATFORM.md) for the full rationale and recovery steps.
