import { NextResponse } from "next/server";
import { isHqAdminAuthorized } from "@/lib/hqAdminAuth";
import { getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import { getHqWebhookControlFlags, updateHqWebhookControlFlags } from "@/lib/hqWebhookControlSettings";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

export async function GET() {
  const flags = await getHqWebhookControlFlags();
  return NextResponse.json({
    ok: true,
    runtime: getWebhookRuntimeMeta(),
    flags,
  });
}

export async function PATCH(request: Request) {
  if (!isHqAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = asObject(body);
  const updated = await updateHqWebhookControlFlags({
    enabled: asBoolean(payload.enabled),
    shadowMode: asBoolean(payload.shadowMode),
    fanoutEnabled: asBoolean(payload.fanoutEnabled),
    dbFanoutEnabled: asBoolean(payload.dbFanoutEnabled),
    allowHttpFanoutWithDb: asBoolean(payload.allowHttpFanoutWithDb),
    eagerDispatchEnabled: asBoolean(payload.eagerDispatchEnabled),
    performanceEditorEnabled: asBoolean(payload.performanceEditorEnabled),
  });

  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status });
  }

  return NextResponse.json({
    ok: true,
    runtime: getWebhookRuntimeMeta(),
    flags: updated.flags,
  });
}
