import { NextResponse } from "next/server";
import { getActiveVerificationOpportunity } from "@/lib/opportunity-service";
import { localExtensionCorsHeaders, rejectDisallowedOrigin } from "@/apps/verifier/lib/cors";

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
  const trade = await getActiveVerificationOpportunity();
  return NextResponse.json({ trade }, { headers: localExtensionCorsHeaders(req, ALLOWED_METHODS) });
}
