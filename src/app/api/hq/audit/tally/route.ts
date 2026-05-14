import { NextResponse } from "next/server";
import { getHqTallyAudit } from "@/lib/hqTallyAudit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const audit = await getHqTallyAudit();
  if (!audit) {
    return NextResponse.json(
      {
        ok: false,
        error: "HQ Supabase service client is not configured or tally query failed.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...audit,
  });
}
