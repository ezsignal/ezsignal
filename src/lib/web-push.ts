import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandId } from "@/lib/registry";

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
};

type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  fail_count: number | null;
};

type VapidKeys = { subject: string; publicKey: string; privateKey: string };

// Each brand has its OWN VAPID key pair (clients subscribed with the brand's public
// key), so the HQ must push with that brand's keys. Configure per brand in HQ env:
//   VAPID_PUBLIC_KEY_<BRAND>, VAPID_PRIVATE_KEY_<BRAND>, VAPID_SUBJECT_<BRAND>
// where <BRAND> is the upper-cased brand id (KAFRA, RICHJOKER, SHINOBI, ...).
function vapidForBrand(brandId: BrandId): VapidKeys | null {
  const up = brandId.toUpperCase();
  const publicKey = (process.env[`VAPID_PUBLIC_KEY_${up}`] ?? "").trim();
  const privateKey = (process.env[`VAPID_PRIVATE_KEY_${up}`] ?? "").trim();
  const subject = (process.env[`VAPID_SUBJECT_${up}`] ?? "mailto:support@ezsignal.app").trim();
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

function isExpiredSubscriptionError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown push error";
}

// Server-side web push for a brand. Uses the brand's own VAPID keys and the shared
// supabase admin client (passed in by the fanout). Safe to call fire-and-forget.
export async function sendBrandWebPush(
  supabase: SupabaseClient,
  brandId: BrandId,
  payload: PushPayload,
): Promise<{ ok: boolean; reason?: string; sent?: number; failed?: number; detail?: string }> {
  const vapid = vapidForBrand(brandId);
  if (!vapid) return { ok: false, reason: "vapid_not_configured" };

  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth, fail_count")
    .eq("brand_id", brandId)
    .eq("is_active", true);
  if (error) return { ok: false, reason: "load_failed", detail: error.message };

  const subscriptions = (data ?? []) as StoredPushSubscription[];
  if (!subscriptions.length) return { ok: true, sent: 0, failed: 0 };

  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? `ezsignal-${brandId}`,
    url: payload.url ?? "/access",
    data: payload.data ?? {},
  });

  let sent = 0;
  let failed = 0;
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        serializedPayload,
        { TTL: 120, vapidDetails: vapid },
      );
      sent += 1;
      await supabase
        .from("web_push_subscriptions")
        .update({
          fail_count: 0,
          last_error: null,
          last_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (err) {
      failed += 1;
      const nextFailCount = (row.fail_count ?? 0) + 1;
      const inactive = isExpiredSubscriptionError(err);
      await supabase
        .from("web_push_subscriptions")
        .update({
          is_active: inactive ? false : true,
          fail_count: nextFailCount,
          last_error: errorMessage(err).slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return { ok: true, sent, failed };
}
