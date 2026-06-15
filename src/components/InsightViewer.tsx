"use client";

import type { InsightRunResult } from "@/lib/posthog-api";
import { TrendView } from "./TrendView";
import { RetentionView } from "./RetentionView";
import { UnknownInsight } from "./UnknownInsight";

export type InsightMeta = {
  shortId: string;
  name: string;
  displayType: string;
  configKind: string;
};

export function InsightViewer({ meta, result }: { meta: InsightMeta; result: InsightRunResult }) {
  if (result.kind === "trends") {
    return <TrendView meta={meta} data={result.data} />;
  }
  if (result.kind === "retention") {
    return <RetentionView meta={meta} data={result.data} />;
  }
  return <UnknownInsight meta={meta} raw={result.data.rawResponse} kind={result.data.configKind} />;
}
