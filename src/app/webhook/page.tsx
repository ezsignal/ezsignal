import HqShell from "@/app/hq-shell";
import WebhookStatusPanel from "@/app/webhook-status-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function WebhookPage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Webhook</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Monitor ingress, queue dispatch, retry, dan status fanout live.
        </p>
      </section>

      <WebhookStatusPanel />
    </HqShell>
  );
}
