"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { COLS, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import type { TrendsResult, TrendsSeriesResult } from "@/lib/posthog-api";
import type { InsightMeta } from "./InsightViewer";

const CHART_ROWS = 17;

// Width of the bar gauge in characters. The full row is 80 wide; we use
// "  " (2) + label(12) + " " (1) + "| " (2) + bar + " " + value + right
// margin. We keep the bar to BAR_WIDTH chars; everything else is sized
// around it.
const LABEL_WIDTH = 12;
const VALUE_WIDTH = 10;
const BAR_WIDTH = COLS - 2 /*left margin*/ - LABEL_WIDTH - 1 - 2 /*"| "*/ - 1 - VALUE_WIDTH - 2 /*right margin*/;

// Full and partial block characters — 8 steps of an eighth-block.
const BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const FULL_BLOCK = "█";

function makeBar(value: number, max: number, width: number): string {
  if (!isFinite(value) || max <= 0 || value <= 0) return "";
  const ratio = Math.min(1, value / max);
  const exact = ratio * width;
  const full = Math.floor(exact);
  const remainder = exact - full;
  const partialIdx = Math.round(remainder * 8);
  let bar = FULL_BLOCK.repeat(full);
  if (partialIdx > 0 && full < width) bar += BLOCKS[partialIdx];
  return bar;
}

function fmtNumber(n: number): string {
  if (n === undefined || n === null || !isFinite(n)) return "-";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1) + "K";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function shortLabel(s: string | undefined, len: number): string {
  if (!s) return "";
  // Strip weekday prefix common in PostHog labels (e.g. "Mon. 6 May")
  const stripped = s.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?\s*/i, "");
  return stripped.toUpperCase().slice(0, len);
}

export function TrendView({ meta, data }: { meta: InsightMeta; data: TrendsResult }) {
  const router = useRouter();
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [seriesIdx, setSeriesIdx] = useState(0);

  useEffect(() => {
    const tick = () => {
      const d = mainframeNow();
      setNow({ date: fmtDate(d), time: fmtTime(d) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const back = useCallback(() => router.push("/menu/browse"), [router]);

  const allSeries: TrendsSeriesResult[] = data.results ?? [];
  const seriesCount = allSeries.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") {
        e.preventDefault();
        back();
        return;
      }
      if (e.key === "F7" || e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        setSeriesIdx((s) => (seriesCount > 0 ? (s - 1 + seriesCount) % seriesCount : 0));
        return;
      }
      if (e.key === "F8" || e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        setSeriesIdx((s) => (seriesCount > 0 ? (s + 1) % seriesCount : 0));
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, seriesCount]);

  const safeIdx = Math.min(seriesIdx, Math.max(0, seriesCount - 1));
  const series = allSeries[safeIdx];

  const { chartLines, totalPoints, visiblePoints, stats } = useMemo(() => {
    if (!series) {
      return {
        chartLines: [] as string[],
        totalPoints: 0,
        visiblePoints: 0,
        stats: null as null | { total: number; avg: number; max: number; min: number },
      };
    }

    const rawData = series.data ?? [];
    const rawLabels = (series.labels && series.labels.length === rawData.length ? series.labels : series.days) ?? [];

    // If aggregate-only series (no time buckets), surface the single value.
    if (rawData.length === 0 && typeof series.aggregated_value === "number") {
      const v = series.aggregated_value;
      const line = "  " + pad("TOTAL", LABEL_WIDTH) + " | " + makeBar(v, Math.max(1, v), BAR_WIDTH) + " " + pad(fmtNumber(v), VALUE_WIDTH, "left");
      return {
        chartLines: [line],
        totalPoints: 1,
        visiblePoints: 1,
        stats: { total: v, avg: v, max: v, min: v },
      };
    }

    // Show most recent N points if there are more than fit.
    const start = Math.max(0, rawData.length - CHART_ROWS);
    const points = rawData.slice(start);
    const labels = rawLabels.slice(start);
    const maxVal = points.reduce((m, v) => (v > m ? v : m), 0);

    const lines: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const v = points[i] ?? 0;
      const lbl = shortLabel(labels[i], LABEL_WIDTH);
      const bar = makeBar(v, maxVal, BAR_WIDTH);
      const valStr = pad(fmtNumber(v), VALUE_WIDTH, "left");
      lines.push("  " + pad(lbl, LABEL_WIDTH) + " | " + pad(bar, BAR_WIDTH) + " " + valStr);
    }

    const totalVal = points.reduce((a, b) => a + (b ?? 0), 0);
    const avgVal = points.length > 0 ? totalVal / points.length : 0;
    const seed = points[0] ?? 0;
    const minVal = points.length > 0 ? points.reduce((m, v) => ((v ?? 0) < m ? (v ?? 0) : m), seed) : 0;

    return {
      chartLines: lines,
      totalPoints: rawData.length,
      visiblePoints: points.length,
      stats: { total: totalVal, avg: avgVal, max: maxVal, min: minVal },
    };
  }, [series]);

  // Pad chart area to exactly CHART_ROWS lines so the rest of the screen
  // stays at fixed row positions.
  const paddedChart: string[] = [];
  for (let i = 0; i < CHART_ROWS; i++) paddedChart.push(chartLines[i] ?? "");

  const dateLine = now
    ? leftRight(("INSIGHT " + meta.shortId.toUpperCase() + " " + meta.name.toUpperCase()).slice(0, COLS - 16), `DATE: ${now.date}`)
    : " ";
  const subTitle = seriesCount > 0
    ? `TRENDS / ${seriesCount} SERIES / VIEWING ${safeIdx + 1}`
    : "TRENDS / NO SERIES";
  const timeLine = now ? leftRight(subTitle, `TIME: ${now.time}`) : " ";

  // "  SERIES: " is 10 chars; allow 2 chars of right margin → slice to COLS-12
  const seriesLabel = series ? series.label.toUpperCase().slice(0, COLS - 12) : "(NO DATA)";

  const statusLine = (() => {
    if (!series || !stats) return "NO DATA RETURNED";
    const truncated = totalPoints > visiblePoints ? `  (${visiblePoints} OF ${totalPoints})` : "";
    return `TOTAL: ${fmtNumber(stats.total)}  AVG: ${fmtNumber(stats.avg)}  MAX: ${fmtNumber(stats.max)}  MIN: ${fmtNumber(stats.min)}  POINTS: ${totalPoints}${truncated}`;
  })();

  const footer = seriesCount > 1
    ? " PF3=Back   PF7=PrevSeries   PF8=NextSeries   ESC=Back"
    : " PF3=Back   ESC=Back";

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{"  SERIES: " + seriesLabel}</Row>
      {paddedChart.map((line, i) => (
        <Row key={i} className="norm">{line || " "}</Row>
      ))}
      <Row className={series ? "bright" : "red"}>{"  " + statusLine}</Row>
      <Row className="dim">{pad(footer, COLS)}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / TRENDS" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
