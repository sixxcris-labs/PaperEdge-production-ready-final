import { db } from "@paperedge/database";

interface TemplateVars {
  player?: string;
  team?: string;
  event?: string;
}

export async function resolveBookUrl(
  bookId: string,
  sport: string,
  marketType: string,
  vars: TemplateVars = {}
): Promise<string | null> {
  const candidates = [
    { sport, marketType },
    { sport, marketType: "default" },
    { sport: "default", marketType },
    { sport: "default", marketType: "default" },
  ];

  for (const c of candidates) {
    const link = await db.bookDeepLink.findFirst({
      where: { bookId, sport: c.sport, marketType: c.marketType },
    });
    if (link) {
      return populateTemplate(link, vars);
    }
  }

  // No template configured for this book → instead of a blank tab, return a
  // targeted web search for "<book> <player/event> <market>" so the user is
  // one click from the exact market they need to confirm.
  return searchFallback(bookId, marketType, vars);
}

async function searchFallback(
  bookId: string,
  marketType: string,
  vars: TemplateVars
): Promise<string> {
  let bookName = "";
  try {
    const book = await db.book.findUnique({ where: { id: bookId } });
    bookName = book?.name ?? "";
  } catch {
    /* book lookup is best-effort */
  }
  const subject = vars.player || vars.team || vars.event || "";
  const market = marketType && marketType !== "default" ? marketType : "";
  const terms = [bookName, "sportsbook", subject, market, "odds"]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!terms) return "about:blank";
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

function populateTemplate(
  link: { urlTemplate: string; queryParam: string | null; fallbackUrl: string | null },
  vars: TemplateVars
): string {
  if (!link.urlTemplate.includes("{query}")) {
    return link.urlTemplate;
  }
  const value = link.queryParam ? vars[link.queryParam as keyof TemplateVars] : null;
  if (!value) {
    return link.fallbackUrl ?? link.urlTemplate.split("?")[0];
  }
  return link.urlTemplate.replace("{query}", encodeURIComponent(value));
}
