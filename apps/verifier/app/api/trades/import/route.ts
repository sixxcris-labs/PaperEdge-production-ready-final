import { NextResponse } from "next/server";
import { createOpportunityFromRaw } from "@/lib/opportunity-service";
import { localExtensionCorsHeaders, rejectDisallowedOrigin } from "@/apps/verifier/lib/cors";

const ALLOWED_METHODS = "POST, OPTIONS";

export async function OPTIONS(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;
  return new Response(null, {
    status: 204,
    headers: localExtensionCorsHeaders(req, ALLOWED_METHODS),
  });
}

export async function POST(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;

  const headers = localExtensionCorsHeaders(req, ALLOWED_METHODS);

  try {
    const body = await req.json();
    const raw = typeof body?.raw === "string" ? body.raw : "";
    const opportunity = await createOpportunityFromRaw(raw);
    return NextResponse.json(
      {
        id: opportunity.id,
        opportunityId: opportunity.id,
        status: opportunity.status,
        verifyUrl: `/verify/${opportunity.id}`,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import opportunity" },
      { status: 400, headers },
    );
  }
}
