import HqShell from "@/app/hq-shell";
import OpsConfigClient from "@/app/ops/ops-config-client";

export default function OpsPage() {
  return (
    <HqShell>
      <OpsConfigClient />
    </HqShell>
  );
}
