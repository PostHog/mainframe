import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { IntroGate } from "@/components/IntroGate";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/menu");
  return (
    <IntroGate>
      <LoginScreen />
    </IntroGate>
  );
}
