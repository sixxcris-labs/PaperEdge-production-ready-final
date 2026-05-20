import { NextResponse } from "next/server";
import { createOpportunityFromRaw } from "@/lib/opportunity-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
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
      { headers: corsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import opportunity" },
      { status: 400, headers: corsHeaders },
    );
  }
}
