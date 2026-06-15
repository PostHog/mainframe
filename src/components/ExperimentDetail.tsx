"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { COLS, fmtDate, fmtLongDate, fmtTime, leftRight, mainframeNow } from "@/lib/screen";
import type { Experiment, ExperimentStatus } from "@/lib/posthog-api";

// Inlined here (rather than imported from posthog-api) because that module
// is marked "server-only" and these are pure value functions that the
// client component needs.
function experimentStatus(e: Experiment): ExperimentStatus {
  if (e.archived) return "ARCHIVED";
  if (e.end_date) return "ENDED";
  if (e.start_date) return "RUNNING";
  return "DRAFT";
}
function experimentFlagKey(e: Experiment): string {
  if (e.feature_flag_key) return e.feature_flag_key;
  if (typeof e.feature_flag === "object" && e.feature_flag?.key) return e.feature_flag.key;
  return "";
}

type Line = { text: string; cls: string };

function dayDiff(from: string, to: string | null): number | null {
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function summariseMetric(m: Record<string, unknown>, idx: number): string {
  const name = (m["name"] as string) || (m["kind"] as string) || `METRIC ${idx + 1}`;
  const kind = (m["kind"] as string) || "";
  const query = m["query"] as Record<string, unknown> | undefined;
  const qkind = query && typeof query.kind === "string" ? (query.kind as string) : "";
  const detail = qkind ? ` (${qkind})` : kind ? ` (${kind})` : "";
  return `${idx + 1}. ${name}${detail}`.toUpperCase();
}

export function ExperimentDetail({
  experiment,
  error,
  expId,
}: {
  experiment: Experiment | null;
  error: string | null;
  expId?: number;
}) {
  const router = useRouter();
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const tick = () => {
      const d = mainframeNow();
      setNow({ date: fmtDate(d), time: fmtTime(d) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const back = useCallback(() => router.push("/menu/experiments"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") { e.preventDefault(); back(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setScroll((s) => s + 1); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setScroll((s) => Math.max(0, s - 1)); return; }
      if (e.key === "PageDown" || e.key === "F8") { e.preventDefault(); setScroll((s) => s + 10); return; }
      if (e.key === "PageUp" || e.key === "F7")   { e.preventDefault(); setScroll((s) => Math.max(0, s - 10)); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / EXPERIMENT DETAIL", `DATE: ${now.date}`) : " ";

  if (!experiment) {
    const errorTitle = now ? leftRight(`EXPERIMENT ${expId ?? "?"}`, `TIME: ${now.time}`) : " ";
    return (
      <Screen>
        <Row className="bright">{dateLine}</Row>
        <Row className="red">{errorTitle}</Row>
        <Row className="dim">{"-".repeat(COLS)}</Row>
        <Row>{" "}</Row>
        <Row className="red">{"  " + (error ?? "EXPERIMENT NOT FOUND")}</Row>
        {Array.from({ length: 17 }).map((_, i) => (
          <Row key={i}>{" "}</Row>
        ))}
        <Row className="dim">{" PF3=Back to Experiment List                                                 "}</Row>
        <OIA systemName="POSTHOG.MAINFRAME / EXPERIMENTS" cursorRow={25} cursorCol={1} />
      </Screen>
    );
  }

  const status = experimentStatus(experiment);
  const flagKey = experimentFlagKey(experiment);
  const startDate = experiment.start_date ? fmtLongDate(new Date(experiment.start_date)) : "(NOT STARTED)";
  const endDate = experiment.end_date ? fmtLongDate(new Date(experiment.end_date)) : status === "RUNNING" ? "(STILL RUNNING)" : "(NOT SET)";
  const duration = experiment.start_date ? dayDiff(experiment.start_date, experiment.end_date ?? null) : null;
  const durationStr = duration != null ? `${duration} DAY${duration === 1 ? "" : "S"}` : "-";

  const subTitle = `EXP-${experiment.id}   ${status}`;
  const timeLine = now ? leftRight(subTitle, `TIME: ${now.time}`) : " ";

  const lines: Line[] = [];
  const createdBy = experiment.created_by?.email ?? experiment.created_by?.first_name ?? "UNKNOWN";

  lines.push({ text: "  NAME:        " + (experiment.name || "(NO NAME)").toUpperCase().slice(0, 60), cls: "bright" });
  lines.push({ text: "  ID:          " + experiment.id, cls: "norm" });
  lines.push({ text: "  STATUS:      " + status, cls: status === "RUNNING" ? "bright" : status === "DRAFT" ? "norm" : "white" });
  lines.push({ text: "  FLAG:        " + (flagKey || "(NONE)"), cls: "norm" });
  lines.push({ text: "  CREATED BY:  " + createdBy.toUpperCase().slice(0, 60), cls: "dim" });
  lines.push({ text: "", cls: "dim" });
  lines.push({ text: "  STARTED:     " + startDate, cls: "norm" });
  lines.push({ text: "  ENDED:       " + endDate, cls: "norm" });
  lines.push({ text: "  DURATION:    " + durationStr, cls: "dim" });

  if (experiment.description) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  DESCRIPTION:", cls: "white" });
    const desc = experiment.description.toUpperCase();
    const words = desc.split(/\s+/);
    let line = "    ";
    for (const w of words) {
      const candidate = line.length > 4 ? line + " " + w : line + w;
      if (candidate.length > COLS - 2) {
        lines.push({ text: line, cls: "dim" });
        line = "    " + w;
      } else {
        line = candidate;
      }
    }
    if (line.trim()) lines.push({ text: line, cls: "dim" });
  }

  // Variants
  const variants = experiment.parameters?.feature_flag_variants ?? [];
  lines.push({ text: "", cls: "dim" });
  lines.push({ text: "  VARIANTS:", cls: "white" });
  if (variants.length === 0) {
    lines.push({ text: "    (none)", cls: "dim" });
  } else {
    for (const v of variants) {
      const pct = `${String(v.rollout_percentage).padStart(3, " ")}%`;
      const name = (v.name || v.key).slice(0, 40);
      lines.push({ text: `    ${pct}  ${v.key.padEnd(20)} ${name}`, cls: "norm" });
    }
  }

  // Primary metric(s)
  const metrics = experiment.metrics ?? [];
  if (metrics.length > 0) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  PRIMARY METRICS:", cls: "white" });
    metrics.forEach((m, i) => {
      lines.push({ text: "    " + summariseMetric(m, i).slice(0, COLS - 6), cls: "norm" });
    });
  }

  // Secondary metrics
  const secondary = experiment.secondary_metrics ?? [];
  if (secondary.length > 0) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  SECONDARY METRICS:", cls: "white" });
    secondary.forEach((m, i) => {
      lines.push({ text: "    " + summariseMetric(m, i).slice(0, COLS - 6), cls: "dim" });
    });
  }

  // Sample size hints
  const params = experiment.parameters;
  if (params && (params.recommended_sample_size || params.recommended_running_time || params.minimum_detectable_effect)) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  ANALYSIS:", cls: "white" });
    if (params.recommended_sample_size) lines.push({ text: "    SAMPLE SIZE: " + params.recommended_sample_size, cls: "dim" });
    if (params.recommended_running_time) lines.push({ text: "    RUNNING TIME: " + params.recommended_running_time + " DAYS", cls: "dim" });
    if (params.minimum_detectable_effect) lines.push({ text: "    MIN DETECT EFFECT: " + params.minimum_detectable_effect + "%", cls: "dim" });
  }

  const BODY_ROWS = 18;
  const maxScroll = Math.max(0, lines.length - BODY_ROWS);
  const safeScroll = Math.min(scroll, maxScroll);
  const visible = lines.slice(safeScroll, safeScroll + BODY_ROWS);
  while (visible.length < BODY_ROWS) visible.push({ text: "", cls: "dim" });

  const moreAbove = safeScroll > 0;
  const moreBelow = lines.length > safeScroll + BODY_ROWS;
  const indicator = moreAbove && moreBelow
    ? "MORE ABOVE AND BELOW   ↑↓=Scroll   F7/F8=Page"
    : moreBelow ? "MORE BELOW   ↓=Scroll   F8=Page"
    : moreAbove ? "MORE ABOVE   ↑=Scroll   F7=Page"
    : `LINES ${lines.length}   END OF DETAIL`;

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className={status === "RUNNING" ? "white" : "dim"}>{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      {visible.map((l, i) => (
        <Row key={i} className={l.cls}>{l.text || " "}</Row>
      ))}
      <Row className="dim">{"  " + indicator}</Row>
      <Row className="dim">{" PF3=Back to Experiment List   ↑↓=Scroll   F7/F8=Page                    "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / EXP / DETAIL" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
