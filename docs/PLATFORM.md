# Platform Policy — Native Windows Only

PaperEdge is a **native Windows** project. All development, scanning, ingestion,
testing, and serving happen on Windows via PowerShell. **WSL is not supported**
and must not be used for any project tooling.

## Why this is a hard rule

The repo has one `node_modules`. Two things in it are platform-specific and
break the moment you cross the Windows/Linux boundary:

1. **`better-sqlite3`** is a compiled native addon. Built on Windows it's a
   Windows PE; built (or `npm install`/`npm rebuild`) under WSL it's a Linux
   ELF. Loading the wrong one makes every database-backed page throw:

   > Invalid `prisma.*` invocation: ... `better_sqlite3.node` is not a valid
   > Win32 application.

2. **File-path resolution.** The scanner reads some sources from local files
   (e.g. novig). Absolute Windows paths (`C:\Users\...`) get mangled under WSL
   (`/mnt/c/...`) or Git Bash (`/c/...`), so the file isn't found and the book
   captures **0 markets** — silently. The fix was to make all config paths
   repo-relative and resolve them in code; keep them that way.

Both failures actually happened (2026-05-22). This policy exists so they don't
happen again.

## Rules

- Run **all** Node / npm / tsx / prisma / vitest / next commands from
  **PowerShell**. Git Bash is acceptable for `git` operations only.
- Never run `wsl`, `wsl bash`, or project commands from a WSL shell.
- Never use `TMPDIR=/tmp`, `/tmp/...`, `/mnt/c/...`, or POSIX absolute paths.
- Config/script file paths must be **repo-relative** (`raw_data/x.json`) and
  resolved against the repo root. Never commit absolute paths.

## Standard commands (PowerShell, from repo root)

```powershell
npm install              # dependencies (Windows build of better-sqlite3)
npm run dev              # dashboard at http://localhost:3000
npm test                 # vitest
npm run scan:auto:once   # one full scan + edge reports
npm run typecheck        # tsc --noEmit
```

## Recovery: "not a valid Win32 application"

Someone ran `npm install`/`npm rebuild` under WSL. From **PowerShell**:

```powershell
npm rebuild better-sqlite3
```

Then restart the dev server. If a `next dev` restart complains that another
server is "already running" but no process exists, delete the stale lock:
`apps/dashboard/.next/dev/lock`.
