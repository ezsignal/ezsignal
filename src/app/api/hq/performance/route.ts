import { NextResponse } from "next/server";
import { getHqSupabaseServiceClient, getWebhookFlags, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import type { BrandId } from "@/lib/registry";

const ALLOWED_OUTCOMES = new Set(["tp1", "tp2", "tp3", "be", "sl"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpdatePerformanceBody = {
  logId?: string;
  brandId?: string;
  outcome?: string;
  points?: number | string | null;
  price?: number | string | null;
  reason?: string;
  editedBy?: string | null;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET(request: Request) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "HQ Supabase service client is not configured.",
        runtime: getWebhookRuntimeMeta(),
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId")?.trim().toLowerCase() ?? "";
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  let query = supabase
    .from("performance_logs")
    .select("id, brand_id, pair, action, outcome, points, price, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (brandId) {
    query = query.eq("brand_id", brandId as BrandId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    flags: getWebhookFlags(),
    runtime: getWebhookRuntimeMeta(),
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function POST(request: Request) {
  const flags = getWebhookFlags();
  if (!flags.performanceEditorEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "HQ performance editor is disabled by flag.",
        flags,
      },
      { status: 409 },
    );
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "HQ Supabase service client is not configured.",
        runtime: getWebhookRuntimeMeta(),
      },
      { status: 503 },
    );
  }

  let body: UpdatePerformanceBody;
  try {
    body = (await request.json()) as UpdatePerformanceBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const logId = body.logId?.trim();
  if (!logId) {
    return NextResponse.json({ ok: false, error: "logId is required." }, { status: 400 });
  }

  const brandId = body.brandId?.trim().toLowerCase();
  let existingQuery = supabase
    .from("performance_logs")
    .select("id, brand_id, outcome, points, price")
    .eq("id", logId)
    .limit(1);

  if (brandId) {
    existingQuery = existingQuery.eq("brand_id", brandId as BrandId);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Performance log not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.outcome === "string" && body.outcome.trim().length > 0) {
    const normalized = body.outcome.trim().toLowerCase();
    if (!ALLOWED_OUTCOMES.has(normalized)) {
      return NextResponse.json(
        { ok: false, error: "outcome must be tp1, tp2, tp3, be, or sl." },
        { status: 400 },
      );
    }
    updates.outcome = normalized;
  }

  if (body.points !== undefined) {
    const parsed = body.points === null ? null : parseNumber(body.points);
    if (body.points !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "points must be a valid number or null." }, { status: 400 });
    }
    updates.points = parsed;
  }

  if (body.price !== undefined) {
    const parsed = body.price === null ? null : parseNumber(body.price);
    if (body.price !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "price must be a valid number or null." }, { status: 400 });
    }
    updates.price = parsed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("performance_logs")
    .update(updates)
    .eq("id", logId)
    .select("id, brand_id, pair, action, outcome, points, price, created_at")
    .single();

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const editedBy = body.editedBy && UUID_REGEX.test(body.editedBy) ? body.editedBy : null;
  const reason = typeof body.reason === "string" && body.reason.trim().length > 0 ? body.reason.trim().slice(0, 500) : null;
  const previousOutcome = typeof existing.outcome === "string" ? existing.outcome : null;
  const nextOutcome = typeof updates.outcome === "string" ? updates.outcome : previousOutcome;

  const { error: editLogError } = await supabase.from("performance_log_edits").insert({
    brand_id: String(existing.brand_id),
    log_id: String(existing.id),
    previous_outcome: previousOutcome,
    next_outcome: nextOutcome,
    reason,
    edited_by: editedBy,
  });

  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    row: updated,
    auditLogged: !editLogError,
    auditError: editLogError?.message ?? null,
  });
}
