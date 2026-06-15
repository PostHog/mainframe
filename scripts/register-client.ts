#!/usr/bin/env -S npx tsx
/**
 * RFC 7591 Dynamic Client Registration bootstrap.
 *
 * Registers an OAuth client against PostHog and prints the client_id values
 * you should paste into .env.local. The client is registered for exactly the
 * read-only scope set in src/lib/scopes.ts — the same list src/auth.ts requests
 * at consent time, so the registration and the authorization request can't drift.
 *
 * Modes:
 *   --dev    register against http://localhost:8010 (default when NODE_ENV != production)
 *   --prod   register against us.posthog.com / eu.posthog.com
 *
 * Override hosts/URLs:
 *   PUBLIC_URL=https://mainframe.posthog.com pnpm tsx scripts/register-client.ts --prod
 *   POSTHOG_DEV_HOST=http://localhost:8000 pnpm tsx scripts/register-client.ts --dev
 */

import { OAUTH_SCOPE_STRING } from "@/lib/scopes";

const argv = process.argv.slice(2);
const wantsProd = argv.includes("--prod");
const wantsDev = argv.includes("--dev") || (!wantsProd && process.env.NODE_ENV !== "production");

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:3000";
const CLIENT_NAME = process.env.CLIENT_NAME ?? "Mainframe 3270 Terminal";
const CONTACT = process.env.CLIENT_CONTACT ?? "engineering@example.com";

const DEV_HOST = process.env.POSTHOG_DEV_HOST ?? "http://localhost:8010";
const PROD_US = process.env.POSTHOG_US_HOST ?? "https://us.posthog.com";
const PROD_EU = process.env.POSTHOG_EU_HOST ?? "https://eu.posthog.com";

const HOSTS: Record<"US" | "EU", string> = wantsDev
  ? { US: DEV_HOST, EU: DEV_HOST }
  : { US: PROD_US, EU: PROD_EU };

async function register(region: "US" | "EU") {
  const host = HOSTS[region];
  const payload = {
    client_name: wantsDev ? `${CLIENT_NAME} (DEV ${region})` : CLIENT_NAME,
    redirect_uris: [`${PUBLIC_URL}/api/auth/callback/posthog-${region.toLowerCase()}`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    scope: OAUTH_SCOPE_STRING,
    contacts: [CONTACT],
  };

  const res = await fetch(`${host}/oauth/register/`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`\n[${region} @ ${host}] FAILED (${res.status}):`, text);
    return null;
  }
  const data = JSON.parse(text);
  console.log(`\n[${region} @ ${host}] registered:`);
  console.log(`  client_id:                ${data.client_id}`);
  if (data.client_secret) console.log(`  client_secret:            ${data.client_secret}`);
  console.log(`  registration_access_token: ${data.registration_access_token ?? "(none)"}`);
  return data;
}

async function main() {
  console.log(`Mode: ${wantsDev ? "DEV (local PostHog)" : "PROD (us/eu.posthog.com)"}`);
  console.log(`Redirect URIs will use PUBLIC_URL=${PUBLIC_URL}`);

  const us = await register("US");
  const eu = await register("EU");

  console.log("\n# Paste into .env.local:");
  if (us?.client_id) console.log(`POSTHOG_US_CLIENT_ID=${us.client_id}`);
  if (eu?.client_id) console.log(`POSTHOG_EU_CLIENT_ID=${eu.client_id}`);
  if (wantsDev) console.log(`POSTHOG_DEV_HOST=${DEV_HOST}`);
  console.log("AUTH_SECRET=" + (process.env.AUTH_SECRET ?? "<run: openssl rand -base64 32>"));
  console.log("AUTH_URL=" + PUBLIC_URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
