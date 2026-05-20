# PaperEdge — Claude Code Build Handoff

This document is the complete spec for building **PaperEdge**, a paper-trading journal for OddsFlex-style sports betting workflows. Follow the phases in order. Do not skip Phase 2 tests.

---

## Project Identity

- **Name:** PaperEdge
- **One-liner:** A process-gated paper-trading journal for sports betting traders practicing arbitrage, promo conversion, and rollover clearing.
- **Out of scope, forever:** Real bets. Sportsbook account connection. Scraping. Geolocation bypass. Payment processing. Anything that helps evade sportsbook controls.

The app must answer two questions for the user:
1. Would I have been profitable with real money?
2. Am I following the OddsFlex process correctly, or making the same mistake repeatedly?

---

## Tech Stack (locked)

```
Framework:    Next.js 14 (App Router)
Language:     TypeScript (strict mode)
Database:     SQLite for local dev, Postgres for prod
ORM:          Prisma
Validation:   Zod everywhere (forms + API)
UI:           Tailwind + shadcn/ui
Forms:        React Hook Form + Zod resolver
Tables:       TanStack Table
Charts:       Recharts (only after Phase 10)
Auth:         skip for MVP (single-user local app)
Testing:      Vitest, mandatory on /lib/calc.ts
Hosting:      Vercel + Neon Postgres (later)
```

---

## Build Phases (do in order)

### Phase 1 — Repo + Prisma schema + seed data
- `npx create-next-app@latest paperedge --typescript --tailwind --app`
- Install: `prisma`, `@prisma/client`, `zod`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table`, `vitest`, `@vitejs/plugin-react`
- Initialize shadcn/ui
- Create the Prisma schema below
- Seed: mistake tags, a starter book list (DraftKings, FanDuel, Bookmaker, BetOnline, ProfitX, Novi, BetUS, BetAnySports, EveryGame, Heritage, Bet105, 7Stacks)

### Phase 2 — Calc module + Vitest suite (DO NOT SKIP)
Build `/lib/calc.ts` exactly as specified below. Write the full Vitest suite before any UI work. The math is the product.

### Phase 3 — Books page with role classification
- CRUD for books
- Each book has a `role`: win_into | lose_out_of | bonus | liquid | exchange | social | unknown
- Force role classification before book can be used in a trade

### Phase 4 — Pre-trade wizard (5 steps)
1. Classify (trade type + goal)
2. Books (A and B, with role display + warnings)
3. Market (event, sport, market type, period, line)
4. Legs (side, odds, stake; hedge calculator button)
5. Confirm + checklist (11 items, all must pass or override+reason)

### Phase 5 — Calculation preview + checklist gate
- Live preview of expected P/L as user types
- "Mark Ready" disabled until checklist complete
- "Force Save (Override)" requires text reason, logged to `checklist_overrides`

### Phase 6 — Trade journal
- TanStack Table with filters: date range, sport, book, trade type, status, bonus type
- Columns: Date, Event, Trade Type, Books, Market, Expected P/L, Actual P/L, Status

### Phase 7 — Trade detail + edit + settlement
- Detail page shows all inputs, checklist result, expected outcome
- Settle button opens form: winning side, actual payout, actual P/L, mistake category, notes
- Status transitions to settled_won/lost/push/partial

### Phase 8 — Bankroll auto-update + dashboard
- On settlement, update `current_bankroll`
- Dashboard rows: Performance / Process Discipline / Bankroll Mechanics
- One chart (equity curve), defer the rest

### Phase 9 — Mistake review + override log
- Aggregate `trade_mistakes` and `checklist_overrides`
- Surface alerts: "You used the wrong calculator 3+ times this month"

### Phase 10 — CSV export + polish + safety banner
- Export trade journal to CSV
- Safety banner on every page (text below)
- Final QA pass

---

## Prisma Schema

Save as `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  displayName     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  books           Book[]
  trades          PaperTrade[]
  bonuses         Bonus[]
  settings        UserSettings?
  bankrollSnaps   BankrollSnapshot[]
}

model UserSettings {
  userId                 String  @id
  user                   User    @relation(fields: [userId], references: [id])
  startingBankroll       Float   @default(1000)
  currentBankroll        Float   @default(1000)
  maxStakePct            Float   @default(5.0)
  oddsFreshnessMinutes   Int     @default(5)
  defaultUnitPct         Float   @default(1.0)
  warnLowHoldPctAbove    Float   @default(3.0)
}

model Book {
  id                 String   @id @default(uuid())
  userId             String
  user               User     @relation(fields: [userId], references: [id])
  name               String
  role               String   @default("unknown")
  // win_into | lose_out_of | bonus | liquid | exchange | social | unknown
  currentBalance     Float    @default(0)
  rolloverRemaining  Float    @default(0)
  maxBetLimit        Float?
  kycCompleted       Boolean  @default(false)
  notes              String?
  createdAt          DateTime @default(now())
  legs               TradeLeg[]
  bonuses            Bonus[]
}

model PaperTrade {
  id                       String   @id @default(uuid())
  userId                   String
  user                     User     @relation(fields: [userId], references: [id])
  tradeDate                DateTime
  sport                    String
  league                   String?
  eventName                String
  marketType               String
  // moneyline | spread | total | team_total | prop
  gamePeriod               String
  // full_game | 1h | 2h | 1q | 2q | 3q | 4q | 1st_inning | other
  lineValue                Float?
  tradeType                String
  // cash_arbitrage | promo_conversion | cash_bonus_conversion | low_hold | rollover_clearing | screener_comparison | other
  bonusType                String   @default("none")
  // none | cash_bonus | promo_free_play | deposit_match | reload | casino_credit | sweepstakes_sc
  goal                     String
  // cash_arb_profit | convert_promo | clear_rollover | zero_out_book | move_funds | build_liquidity | collect_bonus | practice
  requiredCalculator       String
  // arbitrage | promo_converter | low_holds | screener
  status                   String   @default("draft")
  // draft | ready | paper_traded | pending_result | settled_won | settled_lost | settled_push | settled_partial | mistake_invalid | cancelled
  expectedProfitIfA        Float?
  expectedProfitIfB        Float?
  worstCasePL              Float?
  bestCasePL               Float?
  totalStakeExposure       Float?
  hedgeStake               Float?
  promoConversionValue     Float?
  lowHoldLossAmount        Float?
  lowHoldLossPct           Float?
  expectedRoiPct           Float?
  notes                    String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  legs                     TradeLeg[]
  checklist                TradeChecklist?
  result                   Result?
  mistakes                 TradeMistake[]
  overrides                ChecklistOverride[]
}

model TradeLeg {
  id                   String   @id @default(uuid())
  tradeId              String
  trade                PaperTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  bookId               String
  book                 Book     @relation(fields: [bookId], references: [id])
  legLabel             String   // "A" or "B"
  side                 String
  oddsAmerican         Int
  lineValue            Float?
  stake                Float
  isPromoLeg           Boolean  @default(false)
  promoStakeReturned   Boolean  @default(true)
  oddsCapturedAt       DateTime @default(now())
  maxBetAtBook         Float?
  bonusId              String?
  bonus                Bonus?   @relation(fields: [bonusId], references: [id])
  createdAt            DateTime @default(now())
}

model TradeChecklist {
  id                              String   @id @default(uuid())
  tradeId                         String   @unique
  trade                           PaperTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  goalStated                      Boolean  @default(false)
  bookRolesClassified             Boolean  @default(false)
  calculatorMatchesBonusType      Boolean  @default(false)
  sameEventConfirmed              Boolean  @default(false)
  sameMarketTypeConfirmed         Boolean  @default(false)
  sameGamePeriodConfirmed         Boolean  @default(false)
  oppositeSidesConfirmed          Boolean  @default(false)
  sameLineConfirmed               Boolean  @default(false)
  oddsWithinFreshnessWindow       Boolean  @default(false)
  maxBetWithinLimits              Boolean  @default(false)
  bankrollExposureReviewed        Boolean  @default(false)
  promoStakeLogicCorrect          Boolean  @default(false)
  checklistComplete               Boolean  @default(false)
  updatedAt                       DateTime @updatedAt
}

model ChecklistOverride {
  id           String   @id @default(uuid())
  tradeId      String
  trade        PaperTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  failedItems  String   // JSON array
  reason       String
  createdAt    DateTime @default(now())
}

model Result {
  id                       String   @id @default(uuid())
  tradeId                  String   @unique
  trade                    PaperTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  winningSide              String?  // "A" | "B" | "push" | "partial"
  actualPayout             Float?
  actualProfitLoss         Float?
  matchedExpectedOutcome   Boolean?
  resultNotes              String?
  settledAt                DateTime?
  createdAt                DateTime @default(now())
}

model MistakeTag {
  id       String  @id @default(uuid())
  name     String  @unique
  // Seeded: odds_moved, wrong_market, wrong_line, wrong_calculator,
  //         not_opposite_sides, bad_stake_sizing, rollover_misunderstood,
  //         forgot_to_track, stale_odds, max_bet_exceeded, other
  mistakes TradeMistake[]
}

model TradeMistake {
  id            String   @id @default(uuid())
  tradeId       String
  trade         PaperTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  mistakeTagId  String
  mistakeTag    MistakeTag @relation(fields: [mistakeTagId], references: [id])
  notes         String?
  createdAt     DateTime @default(now())
}

model Bonus {
  id                       String   @id @default(uuid())
  userId                   String
  user                     User     @relation(fields: [userId], references: [id])
  bookId                   String
  book                     Book     @relation(fields: [bookId], references: [id])
  bonusAmount              Float
  depositAmount            Float?
  rolloverMultiple         Float?
  requiredBettingVolume    Float?
  volumeCompleted          Float    @default(0)
  volumeRemaining          Float?
  status                   String   @default("not_started")
  // not_started | in_progress | completed | expired | forfeited
  notes                    String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  legs                     TradeLeg[]
}

model BankrollSnapshot {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  snapshotDate      DateTime
  currentBankroll   Float
  dailyPL           Float?
  weeklyPL          Float?
  monthlyPL         Float?
  drawdown          Float?
  createdAt         DateTime @default(now())
}
```

---

## Calculation Module

Save as `/lib/calc.ts`. This is the heart of the app. Tests are mandatory.

```typescript
// /lib/calc.ts

export function americanToDecimal(odds: number): number {
  if (odds === 0 || !Number.isFinite(odds)) {
    throw new Error("Invalid American odds");
  }
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(dec: number): number {
  if (dec <= 1) throw new Error("Decimal odds must be > 1");
  return dec >= 2
    ? Math.round((dec - 1) * 100)
    : Math.round(-100 / (dec - 1));
}

export interface CashPayout {
  totalReturn: number;
  profit: number;
}

export function cashPayout(stake: number, americanOdds: number): CashPayout {
  if (stake <= 0) throw new Error("Stake must be positive");
  const dec = americanToDecimal(americanOdds);
  const totalReturn = stake * dec;
  return { totalReturn, profit: totalReturn - stake };
}

export function promoPayout(stake: number, americanOdds: number): CashPayout {
  if (stake <= 0) throw new Error("Stake must be positive");
  const dec = americanToDecimal(americanOdds);
  const profit = stake * (dec - 1);
  return { totalReturn: profit, profit };
}

export interface CashArbResult {
  stakeB: number;
  totalStake: number;
  profitIfA: number;
  profitIfB: number;
  arbPct: number;
  marginPct: number;
  isArb: boolean;
}

export function cashArbHedge(
  stakeA: number,
  oddsA: number,
  oddsB: number
): CashArbResult {
  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const stakeB = (stakeA * decA) / decB;
  const totalStake = stakeA + stakeB;
  const profitIfA = stakeA * decA - totalStake;
  const profitIfB = stakeB * decB - totalStake;
  const arbPct = 1 / decA + 1 / decB;
  return {
    stakeB,
    totalStake,
    profitIfA,
    profitIfB,
    arbPct,
    marginPct: (1 - arbPct) * 100,
    isArb: arbPct < 1,
  };
}

export interface PromoHedgeResult {
  stakeB: number;
  lockedProfit: number;
  conversionPct: number;
  cashExposure: number;
}

// Side A is the free play (stake NOT returned). Side B is cash hedge.
export function promoHedge(
  promoStake: number,
  promoOdds: number,
  hedgeOdds: number
): PromoHedgeResult {
  const decA = americanToDecimal(promoOdds);
  const decB = americanToDecimal(hedgeOdds);
  // Equalize: promoStake * (decA - 1) - stakeB = stakeB * (decB - 1)
  //   => stakeB = promoStake * (decA - 1) / decB
  const stakeB = (promoStake * (decA - 1)) / decB;
  const lockedProfit = promoStake * (decA - 1) - stakeB;
  return {
    stakeB,
    lockedProfit,
    conversionPct: lockedProfit / promoStake,
    cashExposure: stakeB,
  };
}

export interface LowHoldResult {
  totalStake: number;
  profitIfA: number;
  profitIfB: number;
  worstCaseLoss: number;
  lossPct: number;
}

export function lowHold(
  stakeA: number,
  oddsA: number,
  stakeB: number,
  oddsB: number
): LowHoldResult {
  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const totalStake = stakeA + stakeB;
  const profitIfA = stakeA * decA - totalStake;
  const profitIfB = stakeB * decB - totalStake;
  const worstReturn = Math.min(stakeA * decA, stakeB * decB);
  const lossAmount = totalStake - worstReturn;
  return {
    totalStake,
    profitIfA,
    profitIfB,
    worstCaseLoss: -lossAmount,
    lossPct: (lossAmount / totalStake) * 100,
  };
}

export function isOddsStale(capturedAt: Date, freshnessMinutes: number): boolean {
  const ageMs = Date.now() - capturedAt.getTime();
  return ageMs > freshnessMinutes * 60 * 1000;
}

export function roiPct(profit: number, exposure: number): number {
  if (exposure <= 0) return 0;
  return (profit / exposure) * 100;
}
```

---

## Vitest Suite for Calc Module

Save as `/lib/calc.test.ts`. All tests must pass before Phase 3.

```typescript
import { describe, it, expect } from "vitest";
import {
  americanToDecimal,
  decimalToAmerican,
  cashPayout,
  promoPayout,
  cashArbHedge,
  promoHedge,
  lowHold,
  isOddsStale,
  roiPct,
} from "./calc";

describe("americanToDecimal", () => {
  it("converts positive odds", () => {
    expect(americanToDecimal(140)).toBeCloseTo(2.40, 4);
    expect(americanToDecimal(200)).toBeCloseTo(3.00, 4);
    expect(americanToDecimal(100)).toBeCloseTo(2.00, 4);
  });
  it("converts negative odds", () => {
    expect(americanToDecimal(-130)).toBeCloseTo(1.7692, 4);
    expect(americanToDecimal(-180)).toBeCloseTo(1.5556, 4);
    expect(americanToDecimal(-105)).toBeCloseTo(1.9524, 4);
  });
  it("rejects invalid input", () => {
    expect(() => americanToDecimal(0)).toThrow();
    expect(() => americanToDecimal(NaN)).toThrow();
  });
});

describe("decimalToAmerican", () => {
  it("round-trips positive odds", () => {
    expect(decimalToAmerican(2.40)).toBe(140);
    expect(decimalToAmerican(3.00)).toBe(200);
  });
  it("round-trips negative odds", () => {
    expect(decimalToAmerican(1.7692)).toBe(-130);
  });
});

describe("cashPayout", () => {
  it("calculates profit for +140 with $100 stake", () => {
    const r = cashPayout(100, 140);
    expect(r.totalReturn).toBeCloseTo(240, 2);
    expect(r.profit).toBeCloseTo(140, 2);
  });
  it("calculates profit for -130 with $100 stake", () => {
    const r = cashPayout(100, -130);
    expect(r.profit).toBeCloseTo(76.92, 2);
  });
});

describe("promoPayout", () => {
  it("returns profit only, no stake back", () => {
    const r = promoPayout(100, 200);
    expect(r.profit).toBeCloseTo(200, 2);
    expect(r.totalReturn).toBeCloseTo(200, 2);
  });
});

describe("cashArbHedge — Example 1 from spec", () => {
  it("calculates +140 / -130 arb correctly", () => {
    const r = cashArbHedge(100, 140, -130);
    expect(r.stakeB).toBeCloseTo(135.65, 2);
    expect(r.totalStake).toBeCloseTo(235.65, 2);
    expect(r.profitIfA).toBeCloseTo(4.35, 2);
    expect(r.profitIfB).toBeCloseTo(4.35, 2);
    expect(r.isArb).toBe(true);
    expect(r.marginPct).toBeCloseTo(1.81, 1);
  });
  it("detects non-arb", () => {
    const r = cashArbHedge(100, -110, -110);
    expect(r.isArb).toBe(false);
  });
});

describe("promoHedge — Example 2 from spec", () => {
  it("calculates +200 free play / -180 hedge", () => {
    const r = promoHedge(100, 200, -180);
    expect(r.stakeB).toBeCloseTo(128.57, 2);
    expect(r.lockedProfit).toBeCloseTo(71.43, 2);
    expect(r.conversionPct).toBeCloseTo(0.7143, 4);
  });
});

describe("lowHold — Example 3 from spec", () => {
  it("calculates -105 / -105 low hold loss", () => {
    const r = lowHold(100, -105, 100, -105);
    expect(r.totalStake).toBe(200);
    expect(r.worstCaseLoss).toBeCloseTo(-4.76, 2);
    expect(r.lossPct).toBeCloseTo(2.38, 2);
  });
});

describe("isOddsStale", () => {
  it("returns true for odds older than freshness window", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    expect(isOddsStale(old, 5)).toBe(true);
  });
  it("returns false for fresh odds", () => {
    const fresh = new Date(Date.now() - 1 * 60 * 1000);
    expect(isOddsStale(fresh, 5)).toBe(false);
  });
});

describe("roiPct", () => {
  it("calculates ROI", () => {
    expect(roiPct(4.35, 235.65)).toBeCloseTo(1.85, 2);
  });
  it("handles zero exposure", () => {
    expect(roiPct(10, 0)).toBe(0);
  });
});
```

---

## Calculator Routing Logic

Implement in `/lib/calculator-router.ts`. The wizard calls this to set `requiredCalculator` automatically and block mismatches.

```typescript
export type BonusType =
  | "none" | "cash_bonus" | "promo_free_play" | "deposit_match"
  | "reload" | "casino_credit" | "sweepstakes_sc";

export type TradeType =
  | "cash_arbitrage" | "promo_conversion" | "cash_bonus_conversion"
  | "low_hold" | "rollover_clearing" | "screener_comparison" | "other";

export type Calculator = "arbitrage" | "promo_converter" | "low_holds" | "screener";

export function requiredCalculator(
  bonusType: BonusType,
  tradeType: TradeType
): Calculator {
  if (bonusType === "promo_free_play" || tradeType === "promo_conversion") {
    return "promo_converter";
  }
  if (tradeType === "low_hold" || tradeType === "rollover_clearing") {
    return "low_holds";
  }
  if (tradeType === "screener_comparison") {
    return "screener";
  }
  return "arbitrage";
}

export function calculatorMismatchWarning(
  bonusType: BonusType,
  tradeType: TradeType,
  chosenCalculator: Calculator
): string | null {
  const required = requiredCalculator(bonusType, tradeType);
  if (required === chosenCalculator) return null;
  if (bonusType === "promo_free_play" && chosenCalculator === "arbitrage") {
    return "Promo bets must use Promo Converter. Stake on the promo leg does not return.";
  }
  if (chosenCalculator !== required) {
    return `This trade should use ${required}, not ${chosenCalculator}.`;
  }
  return null;
}
```

---

## Checklist Validation

Implement in `/lib/checklist.ts`. Used by the wizard's final step.

```typescript
import type { TradeChecklist } from "@prisma/client";

const REQUIRED_ITEMS: (keyof TradeChecklist)[] = [
  "goalStated",
  "bookRolesClassified",
  "calculatorMatchesBonusType",
  "sameEventConfirmed",
  "sameMarketTypeConfirmed",
  "sameGamePeriodConfirmed",
  "oppositeSidesConfirmed",
  "sameLineConfirmed",
  "oddsWithinFreshnessWindow",
  "maxBetWithinLimits",
  "bankrollExposureReviewed",
];

export function checklistFailures(c: Partial<TradeChecklist>): string[] {
  return REQUIRED_ITEMS.filter((k) => !c[k]) as string[];
}

export function checklistComplete(c: Partial<TradeChecklist>): boolean {
  return checklistFailures(c).length === 0;
}
```

---

## Seed Data

Save as `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // Single local user
  const user = await db.user.upsert({
    where: { email: "local@paperedge.app" },
    update: {},
    create: { email: "local@paperedge.app", displayName: "Paper Trader" },
  });

  await db.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // Mistake tags
  const tags = [
    "odds_moved", "wrong_market", "wrong_line", "wrong_calculator",
    "not_opposite_sides", "bad_stake_sizing", "rollover_misunderstood",
    "forgot_to_track", "stale_odds", "max_bet_exceeded", "other",
  ];
  for (const name of tags) {
    await db.mistakeTag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Starter books with OddsFlex-suggested roles
  const books = [
    { name: "DraftKings", role: "liquid" },
    { name: "FanDuel", role: "liquid" },
    { name: "Bookmaker", role: "win_into" },
    { name: "BetOnline", role: "win_into" },
    { name: "SportsBetting.ag", role: "win_into" },
    { name: "Bet105", role: "win_into" },
    { name: "ProfitX", role: "exchange" },
    { name: "Novi", role: "exchange" },
    { name: "4CX", role: "exchange" },
    { name: "BetUS", role: "bonus" },
    { name: "BetAnySports", role: "bonus" },
    { name: "BetNow", role: "bonus" },
    { name: "EveryGame", role: "bonus" },
    { name: "Heritage Sports", role: "bonus" },
    { name: "Bovada", role: "lose_out_of" },
    { name: "BetPhoenix", role: "lose_out_of" },
    { name: "7Stacks", role: "lose_out_of" },
    { name: "Sportzino", role: "social" },
    { name: "Fliff", role: "social" },
  ];
  for (const b of books) {
    await db.book.create({
      data: { ...b, userId: user.id },
    });
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
```

Add to `package.json`:
```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

---

## Safety Banner Component

Save as `/components/SafetyBanner.tsx`, render in root layout:

```tsx
export function SafetyBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900">
      <strong>Paper trading only.</strong> This app simulates bets you describe
      manually. It does not connect to sportsbooks, place wagers, scrape accounts,
      bypass geolocation, or guarantee profit. Verify all odds and rules in the
      actual sportsbook before risking real money.
    </div>
  );
}
```

---

## Wizard Step Definitions (for Phase 4)

The wizard lives at `/app/trades/new/page.tsx` with five sub-steps. Use React Hook Form with one Zod schema covering all fields. Show steps progressively but validate the full form on submit.

### Step 1 — Classify
Fields: `tradeType` (radio), `goal` (radio, options filtered by tradeType)

### Step 2 — Books
Fields: `bookAId`, `bookBId`. Display each book's role next to the name. Warn if both same role or goal contradicts roles.

### Step 3 — Market
Fields: `eventName`, `sport`, `league`, `tradeDate`, `marketType`, `gamePeriod`, `lineValue` (only if spread/total)

### Step 4 — Legs
Fields per leg: `side`, `oddsAmerican`, `stake`. Show a "Calculate Hedge" button that calls the appropriate calc function based on `requiredCalculator` and fills Leg B's stake.

### Step 5 — Confirm + Checklist
Show 11 checkboxes. Render the failed items list under the submit button. Submit button is `disabled` until checklist complete or user clicks "Force Save (Override)" which opens a modal requiring a reason.

---

## Dashboard Cards (Phase 8)

Three rows, three cards each:

**Row 1 — Performance**
1. Paper bankroll: `$current (Δ from start, %)`
2. Settled P/L: sum of `actualProfitLoss` where status starts with `settled_`
3. Open exposure: sum of `totalStakeExposure` where status in `[paper_traded, pending_result]`

**Row 2 — Process discipline**
1. Checklist pass rate: % of trades with no overrides
2. Overrides this month: count
3. Top mistake tag (last 30 days)

**Row 3 — Bankroll mechanics**
1. Active rollover books: count + total remaining
2. Liquid bankroll: bankroll minus locked-in-bonus books
3. Largest single-trade exposure: max `totalStakeExposure` as % of bankroll

---

## CSV Export Format (Phase 10)

Columns, in order:
```
trade_date, sport, event, trade_type, bonus_type, goal,
book_a, side_a, odds_a, stake_a,
book_b, side_b, odds_b, stake_b,
expected_pl, actual_pl, status, winning_side, mistakes, notes
```

---

## What "done" looks like

- All Vitest tests pass with `npm test`
- User can complete the wizard end-to-end for a cash arb, a promo conversion, and a low hold
- Trying to use the Arbitrage Calculator on a promo bet shows a blocking warning
- Trying to mark a trade Ready without checklist completion is blocked unless user overrides with a reason
- Settling a trade updates the bankroll and shows on the dashboard
- CSV export downloads a valid file
- Safety banner is visible on every page

---

## Hard rules — do not violate

1. No sportsbook account connection, ever
2. No scraping
3. No geolocation handling
4. No automated bet placement code, even commented out
5. No "real money" mode flag
6. The safety banner is not removable
7. All math goes through `/lib/calc.ts` — no inline calculations in components
8. Every form uses Zod validation
9. Calc tests must pass before merging any UI work
