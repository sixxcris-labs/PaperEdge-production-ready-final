# PaperEdge Quality Gates

Last updated: 2026-05-22 (America/Chicago)

## Canonical Commands
Run from repo root:

```bash
npm run typecheck
npm test
npm run build
npm run build:dashboard
npm run validate
npm run db:backfill-money-cents
npm run db:backfill-money-cents
```

## Expected Outcomes
1. `typecheck` completes with no TypeScript errors.
2. `test` completes with all tests passing.
3. `build` and `build:dashboard` complete successfully.
4. `validate` completes end-to-end (typecheck + tests + dashboard build path).
5. Backfill command is idempotent:
- first run may update rows
- second run must report `Total rows updated: 0`

## Latest Evidence (2026-05-22)
1. `npm run typecheck` ✅
2. `npm test` ✅ (`26` files, `210` tests)
3. `npm run build` ✅
4. `npm run build:dashboard` ✅
5. `npm run validate` ✅
6. Backfill:
- `node --import tsx packages/database/prisma/backfill-money-cents.ts` first run updated `426` rows
- second run updated `0` rows
- `npm run db:backfill-money-cents` now executes via `node --import tsx` and reports `0` updates on re-run
