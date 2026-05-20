# Bookmap

> Personal sportsbook account tracker. Single user, runs on `127.0.0.1` only. **Not for credentials, not for automation, not for scraping.**

Tracks 30+ sportsbooks across the OddsFlex bankroll tiers (Core 3 → Add Next → Test Small → Optional → Low Priority NH → Later (Offshore) → Avoid Early). For each book: status, balance, rollover, bonus, verification, and a one-click "Open" to the book's site.

## Install

```
cd bookmap
npm install
```

## Run (dev)

```
npm run dev
```

- API on `http://127.0.0.1:5174`
- UI on `http://127.0.0.1:5173` (proxies `/api` to the server)

On first run, migrations create the schema and seed all 30 books with `status = verify`.

## Where the database lives

`bookmap/data/bookmap.db` — a single SQLite file. The `data/` folder is gitignored.

## Backup

Just copy the file:

```
cp data/bookmap.db data/bookmap.db.bak
```

Or hit `GET /api/export` (or click "Export backup" in the UI) for a JSON dump. Restore via `POST /api/import` with the same JSON body.

## Wipe and reseed

```
rm data/bookmap.db
npm run dev
```

Migrations and seed re-apply on next startup.

## What this is **not**

- Not a credential manager — there are no password fields, ever.
- Not an automation tool — no login bots, no scraping, no sportsbook API calls.
- Not multi-user, not cloud, not shareable. It binds to localhost on purpose.

If you want it on your phone, run it on your home network behind your own firewall — don't expose it to the internet.
