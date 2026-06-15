import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getInsight,
  insightDisplayType,
  insightName,
  insightQueryKind,
  PostHogApiError,
  runInsightQuery,
} from "@/lib/posthog-api";
import { InsightViewer, type InsightMeta } from "@/components/InsightViewer";
import { UnknownInsight } from "@/components/UnknownInsight";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ shortId: string }> };

export default async function InsightDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { shortId } = await params;

  let meta: InsightMeta;
  try {
    const insight = await getInsight(shortId);
    meta = {
      shortId: insight.short_id,
      name: insightName(insight),
      displayType: insightDisplayType(insight),
      configKind: insightQueryKind(insight),
    };
    const result = await runInsightQuery(insight);
    return <InsightViewer meta={meta} result={result} />;
  } catch (err) {
    // Token expired/invalid → bounce to root so re-auth can happen.
    if (err instanceof PostHogApiError && err.status === 401) redirect("/");
    const status = err instanceof PostHogApiError ? err.status : 500;
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${status} — ${err.message}` + (err.body ? `: ${err.body.slice(0, 200)}` : "")
        : `INTERNAL ERROR: ${String(err)}`;
    const fallback: InsightMeta = {
      shortId,
      name: `LOAD FAILED FOR ${shortId}`,
      displayType: "ERROR",
      configKind: "Error",
    };
    return <UnknownInsight meta={fallback} raw={{ error: msg }} kind="ERROR" />;
  }
}
