import { NextResponse } from "next/server";
import { startOpportunityVerification } from "@/lib/opportunity-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface Props {
  params: Promise<{ id: string }>;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(_req: Request, { params }: Props) {
  try {
    const { id } = await params;
    const opportunity = await startOpportunityVerification(id);
    return NextResponse.json(
      { ok: true, opportunityId: opportunity.id, status: opportunity.status },
      { headers: corsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start verification" },
      { status: 400, headers: corsHeaders },
    );
  }
}
