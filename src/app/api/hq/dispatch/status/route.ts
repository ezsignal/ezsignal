import { NextResponse } from "next/server";
import { getWebhookFlags, getWebhookRuntimeMeta, listDispatchStatus } from "@/lib/hqWebhookRuntime";

export async function GET() {
  const status = await listDispatchStatus();
  return NextResponse.json({
    ok: true,
    flags: getWebhookFlags(),
    runtime: getWebhookRuntimeMeta(),
    ...status,
    now: new Date().toISOString(),
  });
}
