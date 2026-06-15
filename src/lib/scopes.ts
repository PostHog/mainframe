/**
 * OAuth scopes requested from PostHog — the single source of truth.
 *
 * Imported by BOTH the authorization request (src/auth.ts) and the RFC 7591
 * Dynamic Client Registration payload (scripts/register-client.ts), so the
 * registered client and the consent request can never drift apart.
 *
 * READ-ONLY BY POLICY. Every PostHog resource scope is constrained to end in
 * `:read` by the `satisfies readonly ReadScope[]` check below, so adding a
 * mutating scope (e.g. `insight:write`) is a compile error. The app only ever
 * reads PostHog data — see src/lib/posthog-api.ts, where the only POSTs are
 * read-only query executions against /query/ (covered by `query:read`).
 */

/** A PostHog resource scope that grants read access only. */
type ReadScope = `${string}:read`;

// OpenID Connect identity scopes — authentication only, no data access.
const OIDC_SCOPES = ["openid", "profile", "email"] as const;

// PostHog resource scopes — least privilege: one entry per resource the app
// actually reads (every endpoint lives in src/lib/posthog-api.ts). Don't add a
// scope without a screen that calls its endpoint — notably no session_recording
// or person scope, since the app reads neither and both expose PII. The
// `satisfies` clause rejects any non-`:read` entry.
const POSTHOG_READ_SCOPES = [
  "project:read", // resolve current project id (/projects/, /users/@me/)
  "insight:read", // BROWSE screen (/insights/)
  "query:read", // SQL screen + insight execution (/query/)
  "feature_flag:read", // FLAGS screen (/feature_flags/)
  "experiment:read", // EXPERIMENTS screen (/experiments/)
] as const satisfies readonly ReadScope[];

/** Space-separated scope string for an OAuth `scope` parameter. */
export const OAUTH_SCOPE_STRING: string = [...OIDC_SCOPES, ...POSTHOG_READ_SCOPES].join(" ");
