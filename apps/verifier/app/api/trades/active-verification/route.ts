import { NextResponse } from "next/server";
import { getActiveVerificationOpportunity } from "@/lib/opportunity-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  const trade = await getActiveVerificationOpportunity();
  return NextResponse.json({ trade }, { headers: corsHeaders });
}
