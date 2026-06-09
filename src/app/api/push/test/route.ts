import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBrandWebPush } from "@/lib/web-push";
import type { BrandId } from "@/lib/registry";

const VALID_BRANDS: BrandId[] = ["kafra", "sarjan", "richjoker", "shinobi", "kapitan", "liza", "mastery"];

// Diagnostic: send a test web-push to one brand's subscribers, to verify VAPID env +
// subscriptions without waiting for a real signal. Token-protected.
// Usage: GET /api/push/test?brand=kafra&token=<HQ_DISPATCH_RUN_TOKEN or CRON_SECRET>
function authorized(req: NextRequest) {
  const tokens = [process.env.HQ_DISPATCH_RUN_TOKEN?.trim(), process.env.CRON_SECRET?.trim()].filter(
    (v): v is string => Boolean(v && v.length > 0),
  );
  if (tokens.length === 0) return process.env.NODE_ENV !== "production";
  const url = new URL(req.url);
  const qToken = url.searchParams.get("token")?.trim() ?? "";
  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  return tokens.some((t) => qToken === t || authHeader === `Bearer ${t}` || authHeader === t);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized (pass ?token=<HQ_DISPATCH_RUN_TOKEN>)" }, { status: 401 });
  }
  const url = new URL(req.url);
  const brand = (url.searchParams.get("brand") ?? "").trim().toLowerCase() as BrandId;
  if (!VALID_BRANDS.includes(brand)) {
    return NextResponse.json({ error: "invalid brand", valid: VALID_BRANDS }, { status: 400 });
  }

  const supaUrl = process.env.HQ_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey =
    process.env.HQ_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!supaUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  }
  const supabase = createClient(supaUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await sendBrandWebPush(supabase, brand, {
    title: `Test Push — ${brand.toUpperCase()}`,
    body: "Server-side web-push is working. You can receive this with the app closed. ✅",
    tag: `ezsignal-test-${brand}`,
  });

  // Interpret for the caller.
  let hint = "";
  if (!result.ok && result.reason === "vapid_not_configured") {
    hint = `Add VAPID_PUBLIC_KEY_${brand.toUpperCase()} / VAPID_PRIVATE_KEY_${brand.toUpperCase()} to HQ Vercel env, then redeploy.`;
  } else if (result.ok && result.sent === 0) {
    hint = "No active subscriptions for this brand. Enable notifications on the brand's access page first.";
  } else if (result.ok && (result.sent ?? 0) > 0) {
    hint = "Push sent — check the device (works with the app closed).";
  }
  return NextResponse.json({ brand, ...result, hint });
}
