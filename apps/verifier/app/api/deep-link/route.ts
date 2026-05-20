import { resolveBookUrl } from "@/lib/deep-links";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get("bookId") ?? "";
  const sport = searchParams.get("sport") ?? "default";
  const marketType = searchParams.get("marketType") ?? "default";
  const player = searchParams.get("player") ?? undefined;
  const team = searchParams.get("team") ?? undefined;
  const event = searchParams.get("event") ?? undefined;

  const url = await resolveBookUrl(bookId, sport, marketType, { player, team, event });
  return new Response(url ?? "about:blank", { headers: corsHeaders });
}
