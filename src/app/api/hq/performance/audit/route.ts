import { NextResponse } from "next/server";
import { getHqSupabaseServiceClient, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import type { BrandId } from "@/lib/registry";

type AuditRow = {
  id: string;
  brand_id: string;
  log_id: string;
  previous_outcome: string | null;
  next_outcome: string | null;
  reason: string | null;
  edited_by: string | null;
  created_at: string;
};

function normalizeBrandId(input: string | null | undefined): BrandId | null {
  const value = (input ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "kafra") return "kafra";
  if (value === "sarjan") return "sarjan";
  if (value === "shinobi") return "shinobi";
  if (value === "richjoker" || value === "richjokerindi" || value === "richjoker_indi" || value === "rich-joker" || value === "joker" || value === "rich joker") {
    return "richjoker";
  }
  return null;
}

function normalizeAuditRow(row: Record<string, unknown>): AuditRow {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    log_id: String(row.log_id),
    previous_outcome: typeof row.previous_outcome === "string" ? row.previous_outcome : null,
    next_outcome: typeof row.next_outcome === "string" ? row.next_outcome : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    edited_by: typeof row.edited_by === "string" ? row.edited_by : null,
    created_at: String(row.created_at),
  };
}

export async function GET(request: Request) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
  const brandId = normalizeBrandId(searchParams.get("brandId"));
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  let query = supabase
    .from("performance_log_edits")
    .select("id, brand_id, log_id, previous_outcome, next_outcome, reason, edited_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let rows = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeAuditRow);
  if (q) {
    rows = rows.filter((row) => {
      const haystack = [
        row.id,
        row.brand_id,
        row.log_id,
        row.previous_outcome ?? "",
        row.next_outcome ?? "",
        row.reason ?? "",
        row.edited_by ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  return NextResponse.json({
    ok: true,
    runtime: getWebhookRuntimeMeta(),
    count: rows.length,
    rows,
  });
}
