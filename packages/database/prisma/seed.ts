import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ACTIVE_BOOKS, ARCHIVED_DEFAULT_BOOK_NAMES } from "@paperedge/core/constants";
import { PrismaClient } from "../src/generated/prisma/client";

// The generated Prisma client mutates globalThis.__dirname on import; resolve our
// own path from import.meta.url instead of relying on __dirname.
const SEED_DIR = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = `file:${path.resolve(SEED_DIR, "dev.db")}`;
const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: dbUrl }),
});

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

  for (const b of ACTIVE_BOOKS) {
    const existing = await db.book.findFirst({
      where: { userId: user.id, name: b.name },
    });
    if (!existing) {
      await db.book.create({
        data: {
          ...b,
          userId: user.id,
          available: true,
        },
      });
    } else {
      await db.book.update({
        where: { id: existing.id },
        data: { role: b.role, available: true },
      });
    }
  }

  await db.book.updateMany({
    where: {
      userId: user.id,
      name: { in: [...ARCHIVED_DEFAULT_BOOK_NAMES] },
    },
    data: {
      available: false,
    },
  });

  // Deep link templates for active books only.
  const deepLinkSeeds = [
    { book: "4CX", sport: "default", marketType: "default", urlTemplate: "https://4cx.io/", queryParam: null, fallbackUrl: "https://4cx.io/" },
    { book: "Bovada", sport: "default", marketType: "default", urlTemplate: "https://www.bovada.lv/", queryParam: null, fallbackUrl: "https://www.bovada.lv/" },
    { book: "Crypto.com Sports Event Trading", sport: "default", marketType: "default", urlTemplate: "https://web.crypto.com/explore/predict/sports", queryParam: null, fallbackUrl: "https://web.crypto.com/explore/predict/sports" },
    { book: "DraftKings Predictions", sport: "default", marketType: "default", urlTemplate: "https://predictions.draftkings.com/", queryParam: null, fallbackUrl: "https://predictions.draftkings.com/" },
    { book: "Fanatics Markets", sport: "default", marketType: "default", urlTemplate: "https://fanaticsmarkets.com/", queryParam: null, fallbackUrl: "https://fanaticsmarkets.com/" },
    { book: "Fliff", sport: "default", marketType: "default", urlTemplate: "https://www.getfliff.com/", queryParam: null, fallbackUrl: "https://www.getfliff.com/" },
    { book: "Kalshi", sport: "default", marketType: "default", urlTemplate: "https://kalshi.com/search?q={query}", queryParam: "event", fallbackUrl: "https://kalshi.com/markets/sports" },
    { book: "Kalshi", sport: "default", marketType: "player_prop", urlTemplate: "https://kalshi.com/search?q={query}", queryParam: "player", fallbackUrl: "https://kalshi.com/markets/sports" },
    { book: "Novig", sport: "default", marketType: "default", urlTemplate: "https://novig.us/", queryParam: null, fallbackUrl: "https://novig.us/" },
    { book: "Novig", sport: "nba", marketType: "default", urlTemplate: "https://novig.us/sport/basketball/nba", queryParam: null, fallbackUrl: "https://novig.us/" },
    { book: "Novig", sport: "nfl", marketType: "default", urlTemplate: "https://novig.us/sport/football/nfl", queryParam: null, fallbackUrl: "https://novig.us/" },
    { book: "Onyx Odds", sport: "default", marketType: "default", urlTemplate: "https://onyxodds.com/", queryParam: null, fallbackUrl: "https://onyxodds.com/" },
    { book: "Polymarket", sport: "default", marketType: "default", urlTemplate: "https://polymarket.com/", queryParam: null, fallbackUrl: "https://polymarket.com/" },
    { book: "Prophet X", sport: "default", marketType: "default", urlTemplate: "https://www.prophetx.co/", queryParam: null, fallbackUrl: "https://www.prophetx.co/" },
    { book: "Sportzino", sport: "default", marketType: "default", urlTemplate: "https://sportzino.com/", queryParam: null, fallbackUrl: "https://sportzino.com/" },
    { book: "Sportzino", sport: "nba", marketType: "default", urlTemplate: "https://sportzino.com/sports/basketball", queryParam: null, fallbackUrl: "https://sportzino.com/" },
    { book: "BetOpenly", sport: "default", marketType: "default", urlTemplate: "https://betopenly.com/", queryParam: null, fallbackUrl: "https://betopenly.com/" },
    { book: "Betr", sport: "default", marketType: "default", urlTemplate: "https://www.betr.app/", queryParam: null, fallbackUrl: "https://www.betr.app/" },
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
