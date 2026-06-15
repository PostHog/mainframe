import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listExperiments, experimentStatus, experimentFlagKey, PostHogApiError } from "@/lib/posthog-api";
import { ExperimentsScreen, type ExperimentRow } from "@/components/ExperimentsScreen";

export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  try {
    const exps = await listExperiments();
    const rows: ExperimentRow[] = exps.map((e) => ({
      id: e.id,
      name: e.name || `EXP-${e.id}`,
      status: experimentStatus(e),
      flagKey: experimentFlagKey(e),
      startDate: e.start_date ?? "",
      endDate: e.end_date ?? "",
      variantCount: e.parameters?.feature_flag_variants?.length ?? 0,
    }));
    return <ExperimentsScreen rows={rows} error={null} />;
  } catch (err) {
    if (err instanceof PostHogApiError && err.status === 401) redirect("/");
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${err.status} — ${err.message}`
        : `INTERNAL ERROR: ${String(err)}`;
    return <ExperimentsScreen rows={[]} error={msg} />;
  }
}
