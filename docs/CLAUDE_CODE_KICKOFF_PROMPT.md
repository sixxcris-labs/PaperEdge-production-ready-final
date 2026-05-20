# PaperEdge — Claude Code Kickoff

Paste this entire message into Claude Code as your first prompt. Have the three handoff docs in the same directory.

---

You are building **PaperEdge**, a paper-trading journal for sports betting arbitrage with a Chrome extension for line verification.

In this directory you will find three specification documents. They are the complete source of truth:

1. `PAPEREDGE_BUILD_HANDOFF.md` — the main app spec (Phases 1–10)
2. `PAPEREDGE_VERIFICATION_ADDENDUM.md` — the manual verification workflow (inserts Phases 4.5, 4.6, 4.7 between original Phase 4 and Phase 5)
3. `PAPEREDGE_PREFILL_AND_EXTENSION_ADDENDUM.md` — search URL templates and Chrome extension (adds Phases 11, 12, 13 after Phase 10)

## Read all three before starting

Read them in the order listed. Do not start coding until you have read all three. They build on each other.

## Final build order

```
Phase 1  — Repo + Prisma schema + seed data
Phase 2  — Calc module + Vitest tests (MUST PASS before moving on)
Phase 3  — Books page with role classification
Phase 4  — Pre-trade wizard (5 steps)
Phase 4.5 — OddsJam trade intake
Phase 4.6 — Verification screen
Phase 4.7 — Book deep-link registry (basic version)
Phase 5  — Calculation preview + checklist gate
Phase 6  — Trade journal
Phase 7  — Trade detail + edit + settlement
Phase 8  — Bankroll auto-update + dashboard
Phase 9  — Mistake review + override log + verification funnel
Phase 10 — CSV export + polish + safety banner
Phase 11 — Search URL templates (full template system)
Phase 12 — Active verification API + CORS
Phase 13 — Chrome extension MVP
```

## Rules

1. **Stop after each phase.** Show me what you built, summarize the changes, and wait for me to say "continue" before starting the next phase.
2. **Phase 2 tests must pass before Phase 3 starts.** No exceptions. Run `npm test` and show me the output.
3. **Stick to the locked tech stack** in the handoff doc. Do not substitute libraries.
4. **No scraping, no automation of bets, no bypassing book controls, ever.** If you're unsure whether a feature crosses that line, ask me before building it.
5. **Use Zod for every form and API route.** Do not skip validation.
6. **All betting math goes through `/lib/calc.ts`.** No inline calculations in components.
7. **The safety banner stays on every page.** Do not remove it or hide it behind a setting.
8. **Single-user local MVP.** Hard-code `userId = "local-user-id"` for now. Auth comes later.

## Start with Phase 1

Begin Phase 1 now:

- Create the Next.js app with TypeScript, Tailwind, App Router
- Install all listed dependencies including dev dependencies
- Initialize shadcn/ui with the default settings
- Create `prisma/schema.prisma` using the schema from the handoff (with all updates from both addendums merged in — `BookDeepLink` should already use the template fields, not the simple URL field)
- Create `prisma/seed.ts` with the merged seed data (mistake tags, 19 books with Texas-availability defaults, and search URL templates)
- Run `npx prisma migrate dev --name init` and `npx prisma db seed`
- Verify the database has the expected rows
- Report back with: the file tree, the final schema, and confirmation that seeds ran

Do not start Phase 2 until I review Phase 1.

## When in doubt

If any of the three spec docs conflict, the later addendum wins:
- Addendum 3 (prefill/extension) overrides addendum 2 where they overlap
- Addendum 2 (verification) overrides the main handoff where they overlap

If something is ambiguous or missing, ask me before guessing.

Ready? Read the three docs and start Phase 1.
