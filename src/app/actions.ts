"use server";

import { redirect } from "next/navigation";
import { signIn, signOut, auth } from "@/auth";
import { parseRegion, REGIONS } from "@/lib/regions";
import { runHogQL, type HogQLResult, PostHogApiError } from "@/lib/posthog-api";
import { getPostHogClient } from "@/lib/posthog-server";

export async function signInAction(formData: FormData) {
  const region = parseRegion(formData.get("region") as string | null);
  await signIn(REGIONS[region].providerId, { redirectTo: "/menu" });
}

export async function signOutAction() {
  const session = await auth();
  const distinctId = session?.user?.email;
  if (distinctId) {
    const posthog = getPostHogClient();
    posthog.capture({ distinctId, event: "user_signed_out" });
    await posthog.shutdown();
  }
  await signOut({ redirectTo: "/" });
}

export async function runMenuOption(option: string): Promise<{ error?: string; message?: string }> {
  const opt = option.trim().toUpperCase();
  if (!opt) return { error: "ENTER OPTION OR COMMAND" };
  if (opt === "X" || opt === "EXIT" || opt === "LOGOFF" || opt === "QUIT") {
    await signOut({ redirectTo: "/" });
    return {};
  }
  switch (opt) {
    case "1":
    case "BROWSE":
      redirect("/menu/browse");
    case "2":
    case "FLAGS":
      redirect("/menu/flags");
    case "5":
    case "SQL":
    case "HOGQL":
      redirect("/menu/sql");
    case "6":
    case "EXPER":
    case "EXPERIMENTS":
      redirect("/menu/experiments");
    case "N":
    case "NEWS":
      redirect("/menu/news");
  }
  // Placeholder options
  const known = ["3", "4", "7", "U", "S"];
  if (known.includes(opt)) return { message: `OPTION '${opt}' NOT YET AVAILABLE — UNDER CONSTRUCTION` };
  return { error: `UNKNOWN COMMAND '${opt}' — TYPE A NUMBER OR LETTER FROM THE LIST` };
}

export type QueryActionResult =
  | { ok: true; result: HogQLResult }
  | { ok: false; status: number; message: string; body?: string };

export async function runHogQueryAction(query: string): Promise<QueryActionResult> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, status: 400, message: "EMPTY QUERY" };
  const session = await auth();
  const distinctId = session?.user?.email ?? "anonymous";
  try {
    const result = await runHogQL(trimmed);
    if (result.error) {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId,
        event: "hogql_query_executed",
        properties: { success: false, error: result.error, query_length: trimmed.length },
      });
      await posthog.shutdown();
      return { ok: false, status: 400, message: result.error };
    }
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId,
      event: "hogql_query_executed",
      properties: {
        success: true,
        row_count: result.results.length,
        column_count: result.columns.length,
        has_more: result.hasMore ?? false,
        query_length: trimmed.length,
      },
    });
    await posthog.shutdown();
    return { ok: true, result };
  } catch (err) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId,
      event: "hogql_query_executed",
      properties: {
        success: false,
        error: err instanceof PostHogApiError ? err.message : String(err),
        status: err instanceof PostHogApiError ? err.status : 500,
        query_length: trimmed.length,
      },
    });
    await posthog.shutdown();
    if (err instanceof PostHogApiError) {
      return { ok: false, status: err.status, message: err.message, body: err.body?.slice(0, 400) };
    }
    return { ok: false, status: 500, message: String(err) };
  }
}
