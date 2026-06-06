import { NextResponse } from "next/server";
import { getHqSupabaseServiceClient, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import { isHqAdminAuthorized } from "@/lib/hqAdminAuth";

// Padam rekod job HTTP yang gagal/dead (sampah lama). Tidak menghantar apa-apa semula.
// Selamat dalam mod DB fanout — brand terima signal melalui DB, bukan job HTTP ini.
export async function POST(request: Request) {
  if (!isHqAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized clear request." }, { status: 401 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "HQ Supabase service client is not configured." }, { status: 500 });
  }

  // Ambil id dulu supaya boleh lapor jumlah yang dipadam.
  const { data: rows, error: selectError } = await supabase
    .from("signal_dispatch_jobs")
    .select("id")
    .in("status", ["failed", "dead_letter"])
    .limit(2000);

  if (selectError) {
    return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
  }

  const ids = (rows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, clearedCount: 0, runtime: getWebhookRuntimeMeta() });
  }

  const { error: deleteError } = await supabase
    .from("signal_dispatch_jobs")
    .delete()
    .in("id", ids);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    clearedCount: ids.length,
    runtime: getWebhookRuntimeMeta(),
  });
}
