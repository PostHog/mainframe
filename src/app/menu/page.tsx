import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MenuScreen } from "@/components/MenuScreen";

export default async function MenuPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  // @ts-expect-error custom field added in jwt/session callbacks
  const region = (session.user.region as string | undefined) ?? "US";
  return (
    <MenuScreen
      userId={session.user.id}
      email={session.user.email ?? "UNKNOWN"}
      name={session.user.name ?? session.user.email ?? "USER"}
      region={region}
    />
  );
}
