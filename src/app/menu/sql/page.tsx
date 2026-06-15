import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SqlScreen } from "@/components/SqlScreen";

export const dynamic = "force-dynamic";

export default async function SqlPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <SqlScreen />;
}
