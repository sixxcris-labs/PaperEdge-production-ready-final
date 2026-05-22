import { NextResponse } from "next/server";
import { startOpportunityVerification } from "@/lib/opportunity-service";
import { localExtensionCorsHeaders, rejectDisallowedOrigin } from "@/apps/verifier/lib/cors";

const ALLOWED_METHODS = "POST, OPTIONS";

interface Props {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;
  return new Response(null, {
    status: 204,
    headers: localExtensionCorsHeaders(req, ALLOWED_METHODS),
  });
}

export async function POST(req: Request, { params }: Props) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;

  const headers = localExtensionCorsHeaders(req, ALLOWED_METHODS);

  try {
    const { id } = await params;
    const opportunity = await startOpportunityVerification(id);
    return NextResponse.json(
      { ok: true, opportunityId: opportunity.id, status: opportunity.status },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start verification" },
      { status: 400, headers },
    );
  }
}
