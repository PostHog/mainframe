import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFeatureFlag, PostHogApiError } from "@/lib/posthog-api";
import { FlagDetail } from "@/components/FlagDetail";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ key: string }> };

export default async function FlagDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { key } = await params;
  try {
    const flag = await getFeatureFlag(key);
    return <FlagDetail flag={flag} error={null} />;
  } catch (err) {
    if (err instanceof PostHogApiError && err.status === 401) redirect("/");
    const msg =
      err instanceof PostHogApiError
        ? `HTTP ${err.status} — ${err.message}`
        : `INTERNAL ERROR: ${String(err)}`;
    return <FlagDetail flag={null} error={msg} flagKey={key} />;
  }
}
