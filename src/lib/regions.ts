export type Region = "US" | "EU";

export const REGIONS: Record<Region, { providerId: string; label: string }> = {
  US: { providerId: "posthog-us", label: "US" },
  EU: { providerId: "posthog-eu", label: "EU" },
};

export const DEFAULT_REGION: Region = "US";

export function isRegion(value: unknown): value is Region {
  return value === "US" || value === "EU";
}

export function parseRegion(value: string | null | undefined): Region {
  const upper = (value ?? "").toUpperCase();
  return isRegion(upper) ? upper : DEFAULT_REGION;
}

/**
 * Resolve the PostHog host for a given region.
 *
 * In development, both regions point at POSTHOG_DEV_HOST (default
 * http://localhost:8010) so you can iterate against a local PostHog without
 * touching the public clouds. In production, they hit the real regional
 * deployments. Override either cloud host with POSTHOG_US_HOST /
 * POSTHOG_EU_HOST if you're testing against a staging deployment.
 *
 * Server-side only — do NOT call from a "use client" component.
 */
export function regionHost(region: Region): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return process.env.POSTHOG_DEV_HOST || "http://localhost:8010";
  }
  if (region === "US") {
    return process.env.POSTHOG_US_HOST || "https://us.posthog.com";
  }
  return process.env.POSTHOG_EU_HOST || "https://eu.posthog.com";
}
