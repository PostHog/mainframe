import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getExperiment, PostHogApiError } from "@/lib/posthog-api";
import { ExperimentDetail } from "@/components/ExperimentDetail";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ExperimentDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return <ExperimentDetail experiment={null} error={`INVALID EXPERIMENT ID '${id}'`} />;
  }

  try {
    const experiment = await getExperiment(numericId);
    return <ExperimentDetail experiment={experiment} error={null} />;
  } catch (err) {
    if (err instanceof PostHogApiError && err.status === 401) redirect("/");
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${err.status} — ${err.message}`
        : `INTERNAL ERROR: ${String(err)}`;
    return <ExperimentDetail experiment={null} error={msg} expId={numericId} />;
  }
}
