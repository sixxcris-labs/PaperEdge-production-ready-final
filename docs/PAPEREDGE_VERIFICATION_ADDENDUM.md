# PaperEdge — Verification Layer Addendum

This addendum supplements `PAPEREDGE_BUILD_HANDOFF.md`. It adds a verification workflow for the Texas-restricted book list: **Novig, Fliff, Sportzino, Kalshi, theScore**.

## Hard constraint: no scraping, no automation

The app does NOT:
- Scrape sportsbook pages
- Use headless browsers against sportsbooks
- Bypass logins, CAPTCHAs, or geolocation
- Place bets
- Read your sportsbook account in any way

The app DOES:
- Open sportsbook pages in real browser tabs (`window.open` or `<a target="_blank">`)
- Copy useful search terms to clipboard
- Provide deep links to relevant market pages where known
- Walk the user through a manual verification checklist
- Log the verification outcome

This keeps the app compliant with sportsbook Terms of Service.

---

## New phase ordering

Insert these phases between the original Phase 4 and Phase 5:

- **Phase 4.5 — OddsJam trade intake**
- **Phase 4.6 — Verification screen**
- **Phase 4.7 — Book deep-link registry**

The original Phase 5 (calculation preview + checklist gate) still happens, but only after a trade is `verified`.

---

## Data model additions

```prisma
// Add to PaperTrade.status enum (as a comment, since SQLite doesn't enforce enums):
// unverified | verifying | verified |
// not_placed_line_moved | not_placed_odds_moved |
// not_placed_market_unavailable | not_placed_player_not_listed |
// not_placed_book_unavailable | not_placed_other |
// (then existing) ready | paper_traded | pending_result | settled_*

// New fields on PaperTrade
model PaperTrade {
  // ... existing fields
  source              String   @default("manual")   // "manual" | "oddsjam_paste" | "oddsjam_csv"
  oddsjamSnapshotJson String?  // raw OddsJam data captured at import
  importedAt          DateTime?
}

// New fields on TradeLeg
model TradeLeg {
  // ... existing fields
  verificationStatus      String   @default("unverified")
  // unverified | verified | line_moved | odds_moved |
  // market_unavailable | player_not_listed | book_unavailable
  verifiedAt              DateTime?
  observedOddsAmerican    Int?     // what the book actually showed
  observedLineValue       Float?   // what the line actually was
  observationNotes        String?
}

// Book deep links (seeded, user-editable)
model BookDeepLink {
  id          String @id @default(uuid())
  bookId      String
  book        Book   @relation(fields: [bookId], references: [id])
  sport       String  // "nba" | "nfl" | "mlb" | "nhl" | "ncaaf" | "ncaab" | "default"
  marketType  String  // "moneyline" | "spread" | "total" | "player_prop" | "default"
  url         String
  notes       String?
  createdAt   DateTime @default(now())
}

// Add this relation to Book:
model Book {
  // ... existing fields
  deepLinks BookDeepLink[]
  available Boolean @default(true)
  // user toggles books they cannot access (everything except the 5 Texas books = false)
}
```

---

## Texas-allowed book setup

Update the seed file so only these 5 books are `available = true` by default. Mark all others as `available = false`. The user can toggle this later.

```typescript
const TEXAS_ACCESSIBLE = ["Novig", "Fliff", "Sportzino", "Kalshi", "theScore"];

// In seed.ts, when creating each book:
await db.book.create({
  data: {
    ...b,
    userId: user.id,
    available: TEXAS_ACCESSIBLE.includes(b.name),
  },
});
```

The trade wizard's Book A / Book B dropdowns only show `available = true` books. The user gets a "Show all books" toggle if they want to override.

---

## Book deep-link seeds

These are best-effort entry points. The user can edit them when they find better URLs. Start with homepage URLs and refine over time.

```typescript
// Add to seed.ts
const deepLinks = [
  // Novig
  { book: "Novig", sport: "default", marketType: "default", url: "https://novig.us/" },
  { book: "Novig", sport: "nba", marketType: "player_prop", url: "https://novig.us/sport/basketball/nba" },

  // Fliff
  { book: "Fliff", sport: "default", marketType: "default", url: "https://www.getfliff.com/" },

  // Sportzino
  { book: "Sportzino", sport: "default", marketType: "default", url: "https://sportzino.com/" },
  { book: "Sportzino", sport: "nba", marketType: "default", url: "https://sportzino.com/sports/basketball" },

  // Kalshi
  { book: "Kalshi", sport: "default", marketType: "default", url: "https://kalshi.com/markets" },
  { book: "Kalshi", sport: "default", marketType: "moneyline", url: "https://kalshi.com/markets/sports" },

  // theScore
  { book: "theScore", sport: "default", marketType: "default", url: "https://www.thescore.com/" },
];

for (const dl of deepLinks) {
  const book = await db.book.findFirst({
    where: { name: dl.book, userId: user.id },
  });
  if (book) {
    await db.bookDeepLink.create({
      data: {
        bookId: book.id,
        sport: dl.sport,
        marketType: dl.marketType,
        url: dl.url,
      },
    });
  }
}
```

Resolver function in `/lib/deep-links.ts`:

```typescript
import { prisma } from "./db";

export async function resolveBookUrl(
  bookId: string,
  sport: string,
  marketType: string
): Promise<string | null> {
  // Try exact match first
  let link = await prisma.bookDeepLink.findFirst({
    where: { bookId, sport, marketType },
  });
  if (link) return link.url;

  // Try sport + default market
  link = await prisma.bookDeepLink.findFirst({
    where: { bookId, sport, marketType: "default" },
  });
  if (link) return link.url;

  // Fall back to default/default
  link = await prisma.bookDeepLink.findFirst({
    where: { bookId, sport: "default", marketType: "default" },
  });
  return link?.url ?? null;
}
```

---

## OddsJam trade intake (Phase 4.5)

There is no public OddsJam API for the consumer arb finder. The user pastes or types the trade. Two intake modes:

### Mode 1 — Quick paste (recommended)

A textarea on `/app/trades/import/page.tsx`. The user pastes whatever OddsJam shows. The app does NOT try to parse free text into structured fields automatically (too unreliable). Instead, it stores the raw paste in `oddsjamSnapshotJson` as a string and prompts the user to fill the structured wizard fields manually, with the paste shown alongside for reference.

This keeps imports fast and accurate.

### Mode 2 — Structured form

Same as the existing wizard, but starts at the verification screen instead of the checklist screen.

For MVP, build Mode 1 only.

```tsx
// /app/trades/import/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const router = useRouter();

  async function handleStart() {
    const res = await fetch("/api/trades/import", {
      method: "POST",
      body: JSON.stringify({ raw }),
    });
    const { id } = await res.json();
    router.push(`/trades/${id}/verify`);
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Import from OddsJam</h1>
      <p className="text-sm text-gray-600 mb-4">
        Paste the OddsJam trade. You'll fill in the structured fields on the next screen.
      </p>
      <textarea
        className="w-full h-64 border rounded p-3 font-mono text-sm"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste OddsJam arb here..."
      />
      <button
        onClick={handleStart}
        disabled={!raw.trim()}
        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        Start verification
      </button>
    </div>
  );
}
```

---

## Verification screen (Phase 4.6)

Lives at `/app/trades/[id]/verify/page.tsx`. Two-column layout.

**Left column — trade details (read-only):**
- Event, sport, market, period, line
- Leg A: book, side, odds, stake
- Leg B: book, side, odds, stake
- Raw OddsJam paste (collapsed by default)

**Right column — verification actions:**

For each leg:

```tsx
function LegVerification({ leg, dispatch }: Props) {
  const [openingBook, setOpeningBook] = useState(false);

  async function openBook() {
    setOpeningBook(true);
    // Copy player/team name to clipboard
    await navigator.clipboard.writeText(leg.side);
    // Resolve deep link
    const url = await fetch(
      `/api/deep-link?bookId=${leg.bookId}&sport=${trade.sport}&marketType=${trade.marketType}`
    ).then(r => r.text());
    // Open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
    setOpeningBook(false);
  }

  return (
    <div className="border rounded p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Leg {leg.label} — {leg.book.name}</h3>
        <button onClick={openBook} className="text-blue-600 text-sm underline">
          Open {leg.book.name} ▸
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Player name copied to clipboard. Paste into the book's search.
      </p>
      <div className="text-sm mb-3">
        Expected: <strong>{leg.side}</strong> @ <strong>{leg.oddsAmerican}</strong>
        {leg.lineValue !== null && <> (line {leg.lineValue})</>}
      </div>
      <fieldset className="space-y-2">
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="verified" />
          <span>Verified — matches exactly</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="odds_moved" />
          <span>Odds moved</span>
          <input type="number" placeholder="New odds" className="border rounded px-2 w-24" />
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="line_moved" />
          <span>Line moved</span>
          <input type="number" step="0.5" placeholder="New line" className="border rounded px-2 w-24" />
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="market_unavailable" />
          <span>Market unavailable</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="player_not_listed" />
          <span>Player not listed</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`status-${leg.id}`} value="book_unavailable" />
          <span>Book unavailable</span>
        </label>
      </fieldset>
    </div>
  );
}
```

**Bottom action bar:**

```tsx
<div className="border-t mt-6 pt-4 flex gap-3">
  <button
    onClick={saveVerified}
    disabled={!bothLegsVerified}
    className="px-6 py-2 bg-green-600 text-white rounded disabled:opacity-50"
  >
    Mark Verified & Continue
  </button>
  <button onClick={saveNotPlaced} className="px-6 py-2 bg-gray-200 rounded">
    Mark Not Placed
  </button>
</div>
```

The "Mark Verified & Continue" button is only enabled when both legs have `verified` status AND the observed odds still produce a profitable arb (recalculated using `cashArbHedge` with observed odds).

If observed odds reduce the trade to non-arb, the button shows: *"Odds verified but no longer profitable — mark Not Placed?"*

---

## Recalculation on verification

When the user enters observed odds for a leg, recalculate live:

```typescript
// /lib/verify.ts
import { cashArbHedge, promoHedge } from "./calc";

export function recalculateOnObserved(
  trade: PaperTrade,
  observedOddsA: number,
  observedOddsB: number,
  stakeA: number
) {
  if (trade.requiredCalculator === "arbitrage") {
    return cashArbHedge(stakeA, observedOddsA, observedOddsB);
  }
  if (trade.requiredCalculator === "promo_converter") {
    return promoHedge(stakeA, observedOddsA, observedOddsB);
  }
  return null;
}
```

Display the recalculated result next to the original. If the user clicks "Mark Verified", the trade's expected P/L is updated to the **observed** numbers, not the OddsJam numbers.

---

## API routes

```typescript
// /app/api/trades/import/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { raw } = await req.json();
  const userId = "local-user-id"; // from session in real auth

  const trade = await prisma.paperTrade.create({
    data: {
      userId,
      tradeDate: new Date(),
      sport: "unknown",
      eventName: "Pending verification",
      marketType: "moneyline",
      gamePeriod: "full_game",
      tradeType: "cash_arbitrage",
      bonusType: "none",
      goal: "cash_arb_profit",
      requiredCalculator: "arbitrage",
      status: "unverified",
      source: "oddsjam_paste",
      oddsjamSnapshotJson: raw,
      importedAt: new Date(),
    },
  });
  return NextResponse.json({ id: trade.id });
}

// /app/api/deep-link/route.ts
import { resolveBookUrl } from "@/lib/deep-links";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = await resolveBookUrl(
    searchParams.get("bookId")!,
    searchParams.get("sport") ?? "default",
    searchParams.get("marketType") ?? "default"
  );
  return new Response(url ?? "about:blank");
}

// /app/api/trades/[id]/verify-leg/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { legId, status, observedOddsAmerican, observedLineValue, notes } = await req.json();

  await prisma.tradeLeg.update({
    where: { id: legId },
    data: {
      verificationStatus: status,
      observedOddsAmerican,
      observedLineValue,
      observationNotes: notes,
      verifiedAt: new Date(),
    },
  });

  // Check if both legs verified
  const trade = await prisma.paperTrade.findUnique({
    where: { id: params.id },
    include: { legs: true },
  });

  const allVerified = trade?.legs.every((l) => l.verificationStatus === "verified");
  if (allVerified) {
    await prisma.paperTrade.update({
      where: { id: params.id },
      data: { status: "verified" },
    });
  }

  return new Response("ok");
}
```

---

## Verification analytics (Phase 9 addition)

Add a "Verification Funnel" card to the dashboard:

```
Imported from OddsJam:        128
Verified (both legs match):    47  (36.7%)
Not placed — line moved:       31
Not placed — odds moved:       28
Not placed — market gone:      12
Not placed — player missing:   10
```

And a "Verification by book" table showing which books most often fail verification:

```
Book        Attempts  Verified  Pass rate
Novig            45       28      62.2%
Fliff            38       12      31.6%
Sportzino        41        4       9.8%
Kalshi           22       18      81.8%
theScore         19       11      57.9%
```

This is the highest-value report in the app. After a month, the user will know which OddsJam-listed books are actually worth checking.

---

## Updated workflow summary

```
1. OddsJam shows an arb
2. User clicks "Import from OddsJam" → pastes
3. App creates an `unverified` trade
4. Verification screen opens
5. User clicks "Open Novig" → tab opens, player name on clipboard
6. User searches in Novig, finds (or doesn't find) the market
7. User selects status for Leg A → if line/odds moved, enters observed values
8. Repeat for Leg B
9. App recalculates with observed values
10. If still profitable → "Mark Verified & Continue"
11. Trade moves to existing checklist gate (original Phase 5)
12. After games settle → user settles trade as usual
```

Only verified trades count toward paper P/L. Everything else feeds the verification funnel report.

---

## What this does NOT include (intentional)

- No scraping of any sportsbook
- No reading of sportsbook account data
- No automated bet placement
- No geolocation bypass
- No browser extension that watches your sportsbook activity
- No screenshot OCR (could be a v2 feature, but not MVP — adds complexity and copyright concerns with book screenshots)

If you find yourself wanting any of the above, the answer is: don't. The whole product depends on staying ToS-compliant so your sportsbook accounts survive.
