"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { COLS, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import type { ExperimentStatus } from "@/lib/posthog-api";
import posthog from "posthog-js";

export type ExperimentRow = {
  id: number;
  name: string;
  status: ExperimentStatus;
  flagKey: string;
  startDate: string;
  endDate: string;
  variantCount: number;
};

const VISIBLE_ROWS = 13;
const FILTERS: ReadonlyArray<"ALL" | "RUNNING" | "ENDED" | "DRAFT" | "ARCHIVED"> = ["ALL", "RUNNING", "ENDED", "DRAFT", "ARCHIVED"] as const;

function shortDate(iso: string): string {
  if (!iso) return "  --  ";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "  --  ";
}

function statusColor(s: ExperimentStatus): string {
  if (s === "RUNNING") return "bright";
  if (s === "DRAFT") return "norm";
  if (s === "ENDED") return "white";
  return "dim";
}

export function ExperimentsScreen({ rows, error }: { rows: ExperimentRow[]; error: string | null }) {
  const router = useRouter();
  const [filterIdx, setFilterIdx] = useState(0);
  const [selected, setSelected] = useState(0);
  const [topRow, setTopRow] = useState(0);
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = mainframeNow();
      setNow({ date: fmtDate(d), time: fmtTime(d) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const activeFilter = FILTERS[filterIdx];
  const filtered = useMemo(() => {
    if (activeFilter === "ALL") return rows;
    return rows.filter((r) => r.status === activeFilter);
  }, [rows, activeFilter]);

  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));

  useEffect(() => {
    setSelected(0);
    setTopRow(0);
  }, [filterIdx]);

  useEffect(() => {
    if (filtered.length === 0) {
      if (topRow !== 0) setTopRow(0);
      return;
    }
    if (safeSelected < topRow) setTopRow(safeSelected);
    else if (safeSelected >= topRow + VISIBLE_ROWS) setTopRow(safeSelected - VISIBLE_ROWS + 1);
  }, [safeSelected, topRow, filtered.length]);

  const back = useCallback(() => router.push("/menu"), [router]);
  const openSelected = useCallback(() => {
    const r = filtered[safeSelected];
    if (r) {
      posthog.capture("experiment_viewed", {
        experiment_id: r.id,
        experiment_name: r.name,
        experiment_status: r.status,
        flag_key: r.flagKey,
        variant_count: r.variantCount,
      });
      router.push(`/menu/experiments/${r.id}`);
    }
  }, [filtered, safeSelected, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") { e.preventDefault(); back(); return; }
      if (e.key === "Enter") { e.preventDefault(); openSelected(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === "PageDown" || e.key === "F8") { e.preventDefault(); setSelected(Math.min(safeSelected + VISIBLE_ROWS, filtered.length - 1)); return; }
      if (e.key === "PageUp" || e.key === "F7")   { e.preventDefault(); setSelected(Math.max(safeSelected - VISIBLE_ROWS, 0)); return; }
      if (e.key === "Home") { e.preventDefault(); setSelected(0); return; }
      if (e.key === "End") { e.preventDefault(); setSelected(Math.max(0, filtered.length - 1)); return; }
      if (e.key === "F4") {
        e.preventDefault();
        setFilterIdx((i) => e.shiftKey ? (i - 1 + FILTERS.length) % FILTERS.length : (i + 1) % FILTERS.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, openSelected, filtered.length, safeSelected]);

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / EXPERIMENTS", `DATE: ${now.date}`) : " ";
  const filterLabel = activeFilter === "ALL"
    ? `ALL (${rows.length})`
    : `${activeFilter} (${filtered.length}/${rows.length})`;
  const timeLine = now ? leftRight(`${rows.length} TOTAL   |   FILTER: ${filterLabel}`, `TIME: ${now.time}`) : " ";

  // Columns: ROW(3) NAME(28) STATUS(7) FLAG(18) STARTED(8) VARS(4)
  const W_NAME = 28, W_STATUS = 7, W_FLAG = 18, W_DATE = 8, W_VARS = 4;
  const header = "  " +
    pad("ROW", 3) + "  " +
    pad("NAME", W_NAME) + "  " +
    pad("STATUS", W_STATUS) + "  " +
    pad("FLAG", W_FLAG) + "  " +
    pad("STARTED", W_DATE) + "  " +
    pad("VAR", W_VARS);
  const sep = "  " +
    "-".repeat(3) + "  " +
    "-".repeat(W_NAME) + "  " +
    "-".repeat(W_STATUS) + "  " +
    "-".repeat(W_FLAG) + "  " +
    "-".repeat(W_DATE) + "  " +
    "-".repeat(W_VARS);

  const cursorRow = 7 + (safeSelected - topRow);
  const cursorCol = 3;

  return (
    <Screen>
      <Cursor row={cursorRow} col={cursorCol} hidden={filtered.length === 0} />
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{header}</Row>
      <Row className="dim">{sep}</Row>
      {Array.from({ length: VISIBLE_ROWS }).map((_, i) => {
        const globalIdx = topRow + i;
        const r = filtered[globalIdx];
        if (!r) return <Row key={i}>{" "}</Row>;
        const isSelected = globalIdx === safeSelected;
        const num = String(globalIdx + 1).padStart(3, "0");
        const name = pad(r.name.toUpperCase().slice(0, W_NAME), W_NAME);
        const status = pad(r.status, W_STATUS);
        const flag = pad((r.flagKey || "-").slice(0, W_FLAG), W_FLAG);
        const date = pad(shortDate(r.startDate), W_DATE);
        const vars = pad(r.variantCount ? String(r.variantCount) : "-", W_VARS, "left");
        const rowCls = isSelected ? "bright" : statusColor(r.status);
        return (
          <Row key={i} className={rowCls}>
            {`  ${num}  ${name}  ${status}  ${flag}  ${date}  ${vars}`}
          </Row>
        );
      })}
      <Row>{" "}</Row>
      <Row className={error ? "red" : "dim"}>
        {"  " + (error ?? (filtered.length === 0
          ? activeFilter === "ALL" ? "NO EXPERIMENTS FOUND" : `NO ${activeFilter} EXPERIMENTS`
          : `ROW ${String(safeSelected + 1).padStart(3, "0")} OF ${filtered.length}`))}
      </Row>
      <Row className="dim">{" PF3=Back  ↑↓=Scroll  F7/F8=Page  F4=Filter  ENTER=Details             "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / EXPERIMENTS" cursorRow={cursorRow} cursorCol={cursorCol} />
    </Screen>
  );
}
