import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrowseScreen } from "@/components/BrowseScreen";
import { listInsights, insightDisplayType, insightName, PostHogApiError } from "@/lib/posthog-api";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  try {
    const insights = await listInsights(64);
    const rows = insights.map((i) => ({
      shortId: i.short_id,
      name: insightName(i),
      type: insightDisplayType(i),
      created: i.created_at?.slice(0, 10) ?? "",
    }));
    return <BrowseScreen rows={rows} error={null} />;
  } catch (err) {
    const status = err instanceof PostHogApiError ? err.status : 500;
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${status} — ${err.message}` + (err.body ? `: ${err.body.slice(0, 120)}` : "")
        : `INTERNAL ERROR: ${String(err)}`;
    return <BrowseScreen rows={[]} error={msg} />;
  }
}
