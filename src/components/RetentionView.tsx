"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { COLS, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import type { RetentionResult } from "@/lib/posthog-api";
import type { InsightMeta } from "./InsightViewer";

const COHORT_PAGE_SIZE = 15;
const MAX_INTERVAL_COLS = 8;
const COHORT_LABEL_WIDTH = 12;
const CELL_WIDTH = 6; // " 100% " width including padding
const HEADER_LEFT_MARGIN = "  ";

function fmtCohortDate(iso: string): string {
  // ISO like "2024-01-01T00:00:00+00:00" → MM/DD/YY to match project convention.
  if (!iso) return "";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso.slice(0, 10);
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

function fmtPct(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return " --- ";
  const pct = Math.round((numerator / denominator) * 100);
  if (pct >= 100) return " 100%";
  if (pct <= 0) return "   0%";
  return pad(pct + "%", 5, "left");
}

function pctColor(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return "dim";
  const pct = (numerator / denominator) * 100;
  if (pct >= 70) return "bright";
  if (pct >= 30) return "white";
  if (pct >= 10) return "norm";
  if (pct > 0) return "red";
  return "dim";
}

export function RetentionView({ meta, data }: { meta: InsightMeta; data: RetentionResult }) {
  const router = useRouter();
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [page, setPage] = useState(0);

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

  const rows = data.results ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / COHORT_PAGE_SIZE));

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
        setPage((p) => Math.max(0, p - 1));
        return;
      }
      if (e.key === "F8" || e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        setPage((p) => Math.min(totalPages - 1, p + 1));
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, totalPages]);

  const visibleRows = useMemo(
    () => rows.slice(page * COHORT_PAGE_SIZE, (page + 1) * COHORT_PAGE_SIZE),
    [rows, page],
  );

  // How many interval columns do any of the visible cohorts have? Cap at MAX_INTERVAL_COLS.
  const intervalCount = Math.min(
    MAX_INTERVAL_COLS,
    rows.reduce((m, r) => Math.max(m, r.values?.length ?? 0), 0),
  );

  // Build header (column numbers 0..N-1) and separator (---).
  const headerCells: string[] = [];
  const sepCells: string[] = [];
  for (let i = 0; i < intervalCount; i++) {
    headerCells.push(pad(String(i), CELL_WIDTH - 1, "left"));
    sepCells.push(pad("-".repeat(4), CELL_WIDTH - 1, "left"));
  }
  const headerLine = HEADER_LEFT_MARGIN + pad("COHORT", COHORT_LABEL_WIDTH) + " " + headerCells.join(" ");
  const sepLine = HEADER_LEFT_MARGIN + pad("------", COHORT_LABEL_WIDTH) + " " + sepCells.join(" ");

  // Stats: average D1 retention (index 1 across cohorts that have it) and
  // average D7 (index 7) if available.
  const avgRetentionAt = (idx: number): number | null => {
    const eligible = rows.filter((r) => (r.values?.length ?? 0) > idx && (r.values?.[0]?.count ?? 0) > 0);
    if (eligible.length === 0) return null;
    const pcts = eligible.map((r) => (r.values[idx].count / r.values[0].count) * 100);
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
  };
  const d1 = avgRetentionAt(1);
  const d7 = avgRetentionAt(7);

  const dateLine = now
    ? leftRight(("INSIGHT " + meta.shortId.toUpperCase() + " " + meta.name.toUpperCase()).slice(0, COLS - 16), `DATE: ${now.date}`)
    : " ";

  const maxIntervals = rows.reduce((m, r) => Math.max(m, r.values?.length ?? 0), 0);
  const intervalHint = maxIntervals > MAX_INTERVAL_COLS ? ` (${MAX_INTERVAL_COLS}/${maxIntervals})` : "";
  const subTitle = `RETENTION / ${rows.length} COHORTS X ${maxIntervals} INTERVALS${intervalHint}`;
  const timeLine = now ? leftRight(subTitle, `TIME: ${now.time}`) : " ";

  type CohortCell = { text: string; cls: string };
  type CohortLine = { label: string; cells: CohortCell[] } | null;
  const cohortLines: CohortLine[] = [];
  for (let i = 0; i < COHORT_PAGE_SIZE; i++) {
    const row = visibleRows[i];
    if (!row) {
      cohortLines.push(null);
      continue;
    }
    const cohortSize = row.values?.[0]?.count ?? 0;
    const cells: CohortCell[] = [];
    for (let j = 0; j < intervalCount; j++) {
      const v = row.values?.[j];
      if (!v || cohortSize === 0) {
        cells.push({ text: pad(" --- ", CELL_WIDTH - 1, "left"), cls: "dim" });
        continue;
      }
      cells.push({ text: fmtPct(v.count, cohortSize), cls: pctColor(v.count, cohortSize) });
    }
    cohortLines.push({
      label: pad(fmtCohortDate(row.date), COHORT_LABEL_WIDTH),
      cells,
    });
  }

  const statusBits: string[] = [];
  if (d1 !== null) statusBits.push(`AVG D1: ${d1.toFixed(1)}%`);
  if (d7 !== null) statusBits.push(`AVG D7: ${d7.toFixed(1)}%`);
  statusBits.push(`COHORTS: ${rows.length}`);
  statusBits.push(`PAGE ${page + 1}/${totalPages}`);
  const statusLine = rows.length === 0 ? "NO RETENTION DATA RETURNED" : statusBits.join("  ");

  const footer = " PF3=Back   PF7=PrevPage   PF8=NextPage   ESC=Back";

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{headerLine}</Row>
      <Row className="dim">{sepLine}</Row>
      {cohortLines.map((line, i) => {
        if (!line) return <Row key={i}>{" "}</Row>;
        return (
          <Row key={i} className="dim">
            {HEADER_LEFT_MARGIN}
            <span className="white">{line.label}</span>
            {" "}
            {line.cells.map((c, j) => (
              <span key={j}>
                <span className={c.cls}>{c.text}</span>
                {j < line.cells.length - 1 ? " " : ""}
              </span>
            ))}
          </Row>
        );
      })}
      <Row>{" "}</Row>
      <Row className={rows.length === 0 ? "red" : "bright"}>{"  " + statusLine}</Row>
      <Row className="dim">{pad(footer, COLS)}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / RETENTION" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
