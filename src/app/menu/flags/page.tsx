import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listFeatureFlags, flagRolloutPct, flagType, PostHogApiError } from "@/lib/posthog-api";
import { FlagsScreen, type FlagRow } from "@/components/FlagsScreen";

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  try {
    const flags = await listFeatureFlags();
    const rows: FlagRow[] = flags.map((f) => ({
      key: f.key,
      name: f.name || f.key,
      active: f.active,
      rolloutPct: flagRolloutPct(f),
      type: flagType(f),
      created: f.created_at?.slice(0, 10) ?? "",
      experimentCount: f.experiment_set?.length ?? 0,
    }));
    return <FlagsScreen rows={rows} error={null} />;
  } catch (err) {
    if (err instanceof PostHogApiError && err.status === 401) redirect("/");
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${err.status} — ${err.message}`
        : `INTERNAL ERROR: ${String(err)}`;
    return <FlagsScreen rows={[]} error={msg} />;
  }
}
