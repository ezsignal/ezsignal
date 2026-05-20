import { NextResponse } from "next/server";
import { getWebhookRuntimeMeta, listDispatchStatus } from "@/lib/hqWebhookRuntime";
import { getHqWebhookControlFlags } from "@/lib/hqWebhookControlSettings";

export async function GET() {
  const status = await listDispatchStatus();
  const flags = await getHqWebhookControlFlags();
  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    ...status,
    now: new Date().toISOString(),
  });
}
