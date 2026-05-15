import { NextResponse } from "next/server";
import { dispatchQueuedJobs, getHqSupabaseServiceClient, getWebhookFlags, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import { isHqAdminAuthorized } from "@/lib/hqAdminAuth";

export async function POST(request: Request) {
  if (!isHqAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized retry request." }, { status: 401 });
  }

  const flags = getWebhookFlags();
  if (!flags.enabled) {
    return NextResponse.json({ ok: false, error: "HQ webhook is disabled.", flags }, { status: 503 });
  }
  if (flags.shadowMode || !flags.fanoutEnabled) {
    return NextResponse.json(
      { ok: false, error: "Fan-out dispatch is disabled by flags.", flags },
      { status: 409 },
    );
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "HQ Supabase service client is not configured." }, { status: 500 });
  }

  const { data: failedRows, error: failedQueryError } = await supabase
    .from("signal_dispatch_jobs")
    .select("id")
    .in("status", ["failed", "dead_letter"])
    .limit(200);

  if (failedQueryError) {
    return NextResponse.json({ ok: false, error: failedQueryError.message }, { status: 500 });
  }

  const failedIds = (failedRows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (failedIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("signal_dispatch_jobs")
      .update({
        status: "queued",
        next_retry_at: nowIso,
        updated_at: nowIso,
      })
      .in("id", failedIds);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  const result = await dispatchQueuedJobs(Math.max(20, failedIds.length || 1));
  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    retriedCount: failedIds.length,
    result,
  });
}
