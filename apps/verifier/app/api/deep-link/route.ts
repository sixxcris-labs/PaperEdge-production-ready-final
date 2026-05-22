import { resolveBookUrl } from "@/lib/deep-links";
import { localExtensionCorsHeaders, rejectDisallowedOrigin } from "@/apps/verifier/lib/cors";
import {
  parseDeepLinkQuery,
  sanitizeResolvedUrl,
} from "@/apps/verifier/lib/deep-link-request";

const ALLOWED_METHODS = "GET, OPTIONS";

export async function OPTIONS(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;
  return new Response(null, {
    status: 204,
    headers: localExtensionCorsHeaders(req, ALLOWED_METHODS),
  });
}

export async function GET(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;

  const headers = localExtensionCorsHeaders(req, ALLOWED_METHODS);

  try {
    const { searchParams } = new URL(req.url);
    const query = parseDeepLinkQuery(searchParams);
    const url = await resolveBookUrl(query.bookId, query.sport, query.marketType, {
      player: query.player,
      team: query.team,
      event: query.event,
    });
    return new Response(sanitizeResolvedUrl(url), { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid deep-link request", {
      status: 400,
      headers,
    });
  }
}
