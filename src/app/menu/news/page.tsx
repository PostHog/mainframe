import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHeadlinesForMainframeDate, NYTApiError } from "@/lib/nyt-api";
import { NewsScreen } from "@/components/NewsScreen";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  try {
    const { items, date } = await getHeadlinesForMainframeDate();
    return <NewsScreen items={items} dateIso={date.toISOString()} error={null} />;
  } catch (err) {
    const msg =
      err instanceof NYTApiError
        ? `NYT ${err.status}: ${err.message}`
        : `INTERNAL ERROR: ${String(err)}`;
    return <NewsScreen items={[]} dateIso={new Date().toISOString()} error={msg} />;
  }
}
