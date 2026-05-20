import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { resolveBetterSqlite3NativeBinding } from "../lib/better-sqlite3-binding";

const dbUrl = `file:${path.resolve(__dirname, "dev.db")}`;
const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: dbUrl,
    nativeBinding: resolveBetterSqlite3NativeBinding(),
  }),
});

// Texas-accessible books (addendum)
const TEXAS_ACCESSIBLE = ["Novig", "Fliff", "Sportzino", "Kalshi", "theScore"];

async function main() {
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
    "odds_moved",
    "wrong_market",
    "wrong_line",
    "wrong_calculator",
    "not_opposite_sides",
    "bad_stake_sizing",
    "rollover_misunderstood",
    "forgot_to_track",
    "stale_odds",
    "max_bet_exceeded",
    "other",
  ];
  for (const name of tags) {
    await db.mistakeTag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Books with availability flags
  const books = [
    { name: "DraftKings", role: "liquid" },
    { name: "FanDuel", role: "liquid" },
    { name: "Bookmaker", role: "win_into" },
    { name: "BetOnline", role: "win_into" },
    { name: "SportsBetting.ag", role: "win_into" },
    { name: "Bet105", role: "win_into" },
    { name: "ProfitX", role: "exchange" },
    { name: "Novig", role: "exchange" },
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
    { name: "Kalshi", role: "exchange" },
    { name: "theScore", role: "liquid" },
    { name: "DraftKings Predictions", role: "exchange" },
    { name: "BetOPENLY", role: "exchange" },
    { name: "Onyx Odds", role: "win_into" },
    { name: "ReBet", role: "social" },
    { name: "Dogg House", role: "social" },
  ];

  for (const b of books) {
    const existing = await db.book.findFirst({
      where: { userId: user.id, name: b.name },
    });
    if (!existing) {
      await db.book.create({
        data: {
          ...b,
          userId: user.id,
          available: TEXAS_ACCESSIBLE.includes(b.name),
        },
      });
    } else if (existing.available !== TEXAS_ACCESSIBLE.includes(b.name)) {
      await db.book.update({
        where: { id: existing.id },
        data: { available: TEXAS_ACCESSIBLE.includes(b.name) },
      });
    }
  }

  // Deep link templates (addendum 3 — template system)
  const deepLinkSeeds = [
    // Novig
    { book: "Novig", sport: "default", marketType: "default", urlTemplate: "https://novig.us/", queryParam: null, fallbackUrl: "https://novig.us/" },
    { book: "Novig", sport: "nba", marketType: "default", urlTemplate: "https://novig.us/sport/basketball/nba", queryParam: null, fallbackUrl: "https://novig.us/" },
    { book: "Novig", sport: "nfl", marketType: "default", urlTemplate: "https://novig.us/sport/football/nfl", queryParam: null, fallbackUrl: "https://novig.us/" },
    // Fliff
    { book: "Fliff", sport: "default", marketType: "default", urlTemplate: "https://www.getfliff.com/", queryParam: null, fallbackUrl: "https://www.getfliff.com/" },
    // Sportzino
    { book: "Sportzino", sport: "default", marketType: "default", urlTemplate: "https://sportzino.com/", queryParam: null, fallbackUrl: "https://sportzino.com/" },
    { book: "Sportzino", sport: "nba", marketType: "default", urlTemplate: "https://sportzino.com/sports/basketball", queryParam: null, fallbackUrl: "https://sportzino.com/" },
    // Kalshi — has real search
    { book: "Kalshi", sport: "default", marketType: "default", urlTemplate: "https://kalshi.com/search?q={query}", queryParam: "event", fallbackUrl: "https://kalshi.com/markets/sports" },
    { book: "Kalshi", sport: "default", marketType: "player_prop", urlTemplate: "https://kalshi.com/search?q={query}", queryParam: "player", fallbackUrl: "https://kalshi.com/markets/sports" },
    // theScore
    { book: "theScore", sport: "default", marketType: "default", urlTemplate: "https://www.thescore.com/search?q={query}", queryParam: "event", fallbackUrl: "https://www.thescore.com/" },

    // Default homepages for verified offshore/online books
    // (skipped: ProfitX, 4CX, BetAnySports — ambiguous/unverified)
    { book: "DraftKings",       sport: "default", marketType: "default", urlTemplate: "https://sportsbook.draftkings.com/", queryParam: null, fallbackUrl: "https://sportsbook.draftkings.com/" },
    { book: "FanDuel",          sport: "default", marketType: "default", urlTemplate: "https://sportsbook.fanduel.com/",   queryParam: null, fallbackUrl: "https://sportsbook.fanduel.com/" },
    { book: "Bookmaker",        sport: "default", marketType: "default", urlTemplate: "https://www.bookmaker.eu/",          queryParam: null, fallbackUrl: "https://www.bookmaker.eu/" },
    { book: "BetOnline",        sport: "default", marketType: "default", urlTemplate: "https://www.betonline.ag/sports",   queryParam: null, fallbackUrl: "https://www.betonline.ag/sports" },
    { book: "SportsBetting.ag", sport: "default", marketType: "default", urlTemplate: "https://www.sportsbetting.ag/",    queryParam: null, fallbackUrl: "https://www.sportsbetting.ag/" },
    { book: "Bet105",           sport: "default", marketType: "default", urlTemplate: "https://www.bet105.com/",           queryParam: null, fallbackUrl: "https://www.bet105.com/" },
    { book: "BetUS",            sport: "default", marketType: "default", urlTemplate: "https://www.betus.com.pa/",         queryParam: null, fallbackUrl: "https://www.betus.com.pa/" },
    { book: "BetNow",           sport: "default", marketType: "default", urlTemplate: "https://www.betnow.eu/",            queryParam: null, fallbackUrl: "https://www.betnow.eu/" },
    { book: "EveryGame",        sport: "default", marketType: "default", urlTemplate: "https://www.everygame.eu/",         queryParam: null, fallbackUrl: "https://www.everygame.eu/" },
    { book: "Heritage Sports",  sport: "default", marketType: "default", urlTemplate: "https://www.heritagesports.eu/",   queryParam: null, fallbackUrl: "https://www.heritagesports.eu/" },
    { book: "Bovada",           sport: "default", marketType: "default", urlTemplate: "https://www.bovada.lv/",            queryParam: null, fallbackUrl: "https://www.bovada.lv/" },
    { book: "BetPhoenix",       sport: "default", marketType: "default", urlTemplate: "https://www.betphoenix.ag/",       queryParam: null, fallbackUrl: "https://www.betphoenix.ag/" },
  ];

  for (const dl of deepLinkSeeds) {
    const book = await db.book.findFirst({ where: { name: dl.book, userId: user.id } });
    if (!book) continue;
    const existing = await db.bookDeepLink.findFirst({
      where: { bookId: book.id, sport: dl.sport, marketType: dl.marketType },
    });
    if (!existing) {
      await db.bookDeepLink.create({
        data: {
          bookId: book.id,
          sport: dl.sport,
          marketType: dl.marketType,
          urlTemplate: dl.urlTemplate,
          queryParam: dl.queryParam,
          fallbackUrl: dl.fallbackUrl,
        },
      });
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
