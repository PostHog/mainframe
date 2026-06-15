/**
 * PostHog API client — server-only.
 *
 * Pulls the access_token from the Auth.js JWT session and the region's host
 * from regions.ts. Never import this from a "use client" component; the
 * access_token must not cross the network to the browser.
 */

import "server-only";
import { auth } from "@/auth";
import { isRegion, regionHost, type Region } from "./regions";

export type Insight = {
  id: number;
  short_id: string;
  name: string | null;
  derived_name: string | null;
  description?: string | null;
  filters?: Record<string, unknown> & { insight?: string };
  // We keep `query` loosely-typed here — for the query/run flow we pass it
  // through to PostHog as-is. The server unwraps InsightVizNode wrappers.
  query?: (Record<string, unknown> & { kind?: string; source?: { kind?: string } }) | null;
  created_at: string;
  created_by?: { email?: string } | null;
};

// ---- Trends response types ----
// Stable subset of the keys produced by TrendsQueryRunner.build_series_response.

export type TrendsSeriesAction = {
  days?: string[];
  id?: string | number | null;
  type?: "events" | "actions" | string;
  order?: number;
  name?: string;
  custom_name?: string | null;
  math?: string | null;
  math_property?: string | null;
  math_hogql?: string | null;
  math_group_type_index?: number | null;
  properties?: Record<string, unknown>;
};

export type TrendsSeriesResult = {
  label: string;
  data: number[];
  labels?: string[];
  days: string[];
  count?: number;
  aggregated_value?: number;
  breakdown_value?: string | number | boolean | Array<string | number> | "none" | "all";
  compare?: boolean;
  compare_label?: "current" | "previous";
  action: TrendsSeriesAction;
  filter?: Record<string, unknown>;
};

export type TrendsResult = {
  results: TrendsSeriesResult[];
  hasMore?: boolean;
  hogql?: string;
  error?: string;
  resolved_date_range?: { date_from: string; date_to: string };
  is_cached?: boolean;
  last_refresh?: string;
  timezone?: string;
};

// ---- Retention response types ----

export type RetentionValue = {
  count: number;
  label?: string;
  aggregation_value?: number;
};

export type RetentionRow = {
  label: string;
  date: string;
  breakdown_value?: string | number | null;
  values: RetentionValue[];
};

export type RetentionResult = {
  results: RetentionRow[];
  hogql?: string;
  error?: string | null;
  resolved_date_range?: { date_from: string; date_to: string } | null;
  is_cached?: boolean;
  last_refresh?: string;
  timezone?: string;
};

export type InsightRunResult =
  | { kind: "trends"; data: TrendsResult }
  | { kind: "retention"; data: RetentionResult }
  | { kind: "unsupported"; data: { rawResponse: unknown; configKind: string } };

export type ProjectSummary = {
  id: number;
  name: string;
  organization: string;
};

export type HogQLResult = {
  columns: string[];
  types: string[];
  results: unknown[][];
  hogql?: string;
  hasMore?: boolean;
  error?: string;
};

type Session = {
  region: Region;
  accessToken: string;
  host: string;
};

export class PostHogApiError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

async function loadSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user) return null;
  // @ts-expect-error custom fields
  const region = session.user.region;
  // @ts-expect-error custom fields
  const accessToken = session.accessToken as string | undefined;
  if (!isRegion(region) || !accessToken) return null;
  return { region, accessToken, host: regionHost(region) };
}

async function ph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await loadSession();
  if (!s) throw new PostHogApiError(401, "NO SESSION");

  const url = `${s.host}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${s.accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new PostHogApiError(res.status, `HTTP ${res.status} on ${path}`, body);
  }
  return res.json() as Promise<T>;
}

export async function getCurrentProjectId(): Promise<number> {
  const s = await loadSession();
  if (!s) throw new PostHogApiError(401, "NO SESSION");

  // No cache: the project id is per-user and Next/Vercel may serve
  // concurrent users from the same process — a module-level cache would
  // leak User A's project id into User B's requests.

  // Try /api/users/@me/ first — has team.id of the user's current team
  type Me = { team?: { id?: number }; teams?: { id: number }[] };
  try {
    const me = await ph<Me>("/api/users/@me/");
    const id = me.team?.id ?? me.teams?.[0]?.id;
    if (id) return id;
  } catch {
    /* fall through to project list */
  }

  // Fall back to /api/projects/
  type ProjectList = { results: { id: number }[] };
  const list = await ph<ProjectList>("/api/projects/");
  const id = list.results?.[0]?.id;
  if (!id) throw new PostHogApiError(404, "NO PROJECTS AVAILABLE");
  return id;
}

export async function listInsights(limit = 50): Promise<Insight[]> {
  const projectId = await getCurrentProjectId();
  type Resp = { results: Insight[] };
  const res = await ph<Resp>(`/api/projects/${projectId}/insights/?limit=${limit}&order=-last_modified_at`);
  return res.results ?? [];
}

export async function runHogQL(query: string): Promise<HogQLResult> {
  const projectId = await getCurrentProjectId();
  type RawResp = {
    columns?: string[];
    types?: string[] | (string | null)[];
    results?: unknown[][];
    hogql?: string;
    hasMore?: boolean;
    error?: string;
  };
  const body = JSON.stringify({ query: { kind: "HogQLQuery", query } });
  const res = await ph<RawResp>(`/api/projects/${projectId}/query/`, {
    method: "POST",
    body,
  });
  return {
    columns: res.columns ?? [],
    types: (res.types ?? []).map((t) => (t == null ? "" : String(t))),
    results: res.results ?? [],
    hogql: res.hogql,
    hasMore: res.hasMore,
    error: res.error,
  };
}

export function insightDisplayType(i: Insight): string {
  const k = i.query?.kind ?? i.filters?.insight;
  if (!k) return "OTHER";
  const map: Record<string, string> = {
    TrendsQuery: "TRENDS",
    FunnelsQuery: "FUNNELS",
    RetentionQuery: "RETENT",
    PathsQuery: "PATHS",
    LifecycleQuery: "LIFECY",
    StickinessQuery: "STICKY",
    HogQLQuery: "HOGQL",
    TRENDS: "TRENDS",
    FUNNELS: "FUNNELS",
    RETENTION: "RETENT",
    PATHS: "PATHS",
    LIFECYCLE: "LIFECY",
    STICKINESS: "STICKY",
    SQL: "HOGQL",
  };
  return map[k] ?? k.slice(0, 7).toUpperCase();
}

export function insightName(i: Insight): string {
  return (i.name ?? i.derived_name ?? `INSIGHT ${i.short_id}`).trim();
}

export async function getInsight(shortId: string): Promise<Insight> {
  const projectId = await getCurrentProjectId();
  type Resp = { results: Insight[] };
  // Filtering by short_id returns at most one match (short_ids are unique within a project).
  const res = await ph<Resp>(
    `/api/projects/${projectId}/insights/?short_id=${encodeURIComponent(shortId)}&limit=1`,
  );
  const first = res.results?.[0];
  if (!first) throw new PostHogApiError(404, `INSIGHT ${shortId} NOT FOUND`);
  return first;
}

/**
 * Return the query "kind" we should treat this insight as, normalising the
 * legacy InsightVizNode wrapper and the very old `filters.insight` field.
 */
export function insightQueryKind(insight: Insight): string {
  const q = insight.query;
  if (q && typeof q === "object") {
    if (q.kind === "InsightVizNode" && q.source?.kind) return q.source.kind;
    if (q.kind) return q.kind;
  }
  const legacy = insight.filters?.insight;
  if (typeof legacy === "string") {
    // Map legacy keys to their query equivalents.
    const map: Record<string, string> = {
      TRENDS: "TrendsQuery",
      FUNNELS: "FunnelsQuery",
      RETENTION: "RetentionQuery",
      PATHS: "PathsQuery",
      LIFECYCLE: "LifecycleQuery",
      STICKINESS: "StickinessQuery",
      SQL: "HogQLQuery",
    };
    return map[legacy] ?? legacy;
  }
  return "Unknown";
}

/**
 * Execute the query for an insight via /api/projects/<id>/query/ and return
 * a typed discriminated-union result. Trends + Retention are typed; anything
 * else is returned as `unsupported` with the raw response for inspection.
 */
export async function runInsightQuery(insight: Insight): Promise<InsightRunResult> {
  const projectId = await getCurrentProjectId();
  const kind = insightQueryKind(insight);

  // Build the query envelope. PostHog's process_query_model auto-unwraps
  // InsightVizNode, so we can pass the saved insight.query object straight
  // through. If only legacy `filters` exist, the server-side serializer
  // already converted them when the insight was fetched (insight.query is
  // populated in that case), so we should rarely hit the fallback.
  const queryBody = insight.query ?? null;
  if (!queryBody) {
    throw new PostHogApiError(
      400,
      "INSIGHT HAS NO QUERY DEFINITION",
      "Both insight.query and insight.filters are missing — cannot execute.",
    );
  }

  const body = JSON.stringify({ query: queryBody });
  const raw = await ph<unknown>(`/api/projects/${projectId}/query/`, { method: "POST", body });

  if (kind === "TrendsQuery") {
    return { kind: "trends", data: raw as TrendsResult };
  }
  if (kind === "RetentionQuery") {
    return { kind: "retention", data: raw as RetentionResult };
  }
  return { kind: "unsupported", data: { rawResponse: raw, configKind: kind } };
}

// ---- Feature flags ----

export type FeatureFlagProperty = {
  key?: string;
  value?: unknown;
  operator?: string;
  type?: string;
};

export type FeatureFlagGroup = {
  properties?: FeatureFlagProperty[];
  rollout_percentage?: number | null;
  variant?: string | null;
};

export type FeatureFlagVariant = {
  key: string;
  rollout_percentage: number;
  name?: string;
};

export type FeatureFlag = {
  id: number;
  key: string;
  name: string;
  active: boolean;
  deleted?: boolean;
  filters: {
    groups?: FeatureFlagGroup[];
    multivariate?: { variants?: FeatureFlagVariant[] } | null;
    payloads?: Record<string, string>;
    aggregation_group_type_index?: number | null;
  };
  rollout_percentage?: number | null;
  created_at: string;
  created_by?: { email?: string; first_name?: string } | null;
  experiment_set?: number[];
  is_simple_flag?: boolean;
  ensure_experience_continuity?: boolean;
  tags?: string[];
};

export async function listFeatureFlags(limit = 200): Promise<FeatureFlag[]> {
  const projectId = await getCurrentProjectId();
  type Resp = { results: FeatureFlag[] };
  const res = await ph<Resp>(
    `/api/projects/${projectId}/feature_flags/?limit=${limit}&order=-created_at`,
  );
  return (res.results ?? []).filter((f) => !f.deleted);
}

export async function getFeatureFlag(key: string): Promise<FeatureFlag> {
  // The list endpoint supports ?search=<key> for substring match; we filter to
  // exact-key to handle multiple matches.
  const projectId = await getCurrentProjectId();
  type Resp = { results: FeatureFlag[] };
  const res = await ph<Resp>(
    `/api/projects/${projectId}/feature_flags/?search=${encodeURIComponent(key)}&limit=20`,
  );
  const exact = (res.results ?? []).find((f) => f.key === key && !f.deleted);
  if (exact) return exact;
  // Fall back to scanning all flags (slower; only on cache miss).
  const all = await listFeatureFlags();
  const found = all.find((f) => f.key === key);
  if (!found) throw new PostHogApiError(404, `FLAG '${key}' NOT FOUND`);
  return found;
}

export function flagRolloutPct(flag: FeatureFlag): number {
  if (!flag.active) return 0;
  const groups = flag.filters?.groups ?? [];
  if (groups.length === 0) return flag.rollout_percentage ?? 100;
  const maxGroup = Math.max(...groups.map((g) => g.rollout_percentage ?? 0));
  return Number.isFinite(maxGroup) ? maxGroup : 0;
}

export function flagType(flag: FeatureFlag): "BOOL" | "MULTI" {
  return flag.filters?.multivariate?.variants?.length ? "MULTI" : "BOOL";
}

// ---- Experiments ----

export type ExperimentVariant = {
  key: string;
  rollout_percentage: number;
  name?: string;
};

export type Experiment = {
  id: number;
  name: string;
  description?: string;
  feature_flag_key?: string;
  feature_flag?: number | { id?: number; key?: string };
  start_date?: string | null;
  end_date?: string | null;
  archived: boolean;
  parameters?: {
    feature_flag_variants?: ExperimentVariant[];
    recommended_sample_size?: number;
    recommended_running_time?: number;
    minimum_detectable_effect?: number;
  };
  metrics?: Array<Record<string, unknown>>;
  secondary_metrics?: Array<Record<string, unknown>>;
  saved_metrics?: Array<Record<string, unknown>>;
  filters?: Record<string, unknown>;
  exposure_cohort?: number | null;
  created_at: string;
  updated_at?: string;
  created_by?: { email?: string; first_name?: string } | null;
};

export type ExperimentStatus = "DRAFT" | "RUNNING" | "ENDED" | "ARCHIVED";

export function experimentStatus(exp: Experiment): ExperimentStatus {
  if (exp.archived) return "ARCHIVED";
  if (exp.end_date) return "ENDED";
  if (exp.start_date) return "RUNNING";
  return "DRAFT";
}

export function experimentFlagKey(exp: Experiment): string {
  if (exp.feature_flag_key) return exp.feature_flag_key;
  if (typeof exp.feature_flag === "object" && exp.feature_flag?.key) return exp.feature_flag.key;
  return "";
}

export async function listExperiments(limit = 200): Promise<Experiment[]> {
  const projectId = await getCurrentProjectId();
  type Resp = { results: Experiment[] };
  const res = await ph<Resp>(
    `/api/projects/${projectId}/experiments/?limit=${limit}&order=-created_at`,
  );
  return res.results ?? [];
}

export async function getExperiment(id: number): Promise<Experiment> {
  const projectId = await getCurrentProjectId();
  return ph<Experiment>(`/api/projects/${projectId}/experiments/${id}/`);
}
