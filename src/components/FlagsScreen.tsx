"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { COLS, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";

export type FlagRow = {
  key: string;
  name: string;
  active: boolean;
  rolloutPct: number;
  type: "BOOL" | "MULTI";
  created: string;
  experimentCount: number;
};

const VISIBLE_ROWS = 13;
const FILTERS: ReadonlyArray<"ALL" | "ACTIVE" | "PAUSED"> = ["ALL", "ACTIVE", "PAUSED"] as const;

function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "--/--/--";
}

export function FlagsScreen({ rows, error }: { rows: FlagRow[]; error: string | null }) {
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
    if (activeFilter === "ACTIVE") return rows.filter((r) => r.active);
    return rows.filter((r) => !r.active);
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
    if (r) router.push(`/menu/flags/${encodeURIComponent(r.key)}`);
  }, [filtered, safeSelected, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") { e.preventDefault(); back(); return; }
      if (e.key === "Enter") { e.preventDefault(); openSelected(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === "PageDown" || e.key === "F8") {
        e.preventDefault();
        setSelected(Math.min(safeSelected + VISIBLE_ROWS, filtered.length - 1));
        return;
      }
      if (e.key === "PageUp" || e.key === "F7") {
        e.preventDefault();
        setSelected(Math.max(safeSelected - VISIBLE_ROWS, 0));
        return;
      }
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

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / FEATURE FLAGS", `DATE: ${now.date}`) : " ";
  const counts = `${rows.length} TOTAL`;
  const filterLabel = activeFilter === "ALL"
    ? `ALL (${rows.length})`
    : `${activeFilter} (${filtered.length}/${rows.length})`;
  const timeLine = now ? leftRight(`${counts}   |   FILTER: ${filterLabel}`, `TIME: ${now.time}`) : " ";

  // Columns: ROW(3) KEY(28) STATUS(6) ROLL(4) TYPE(5) EXP(3) CREATED(8) — 2-space gaps + 2 margin
  const W_KEY = 28, W_STATUS = 6, W_ROLL = 4, W_TYPE = 5, W_EXP = 3, W_DATE = 8;
  const header = "  " +
    pad("ROW", 3) + "  " +
    pad("KEY", W_KEY) + "  " +
    pad("STATUS", W_STATUS) + "  " +
    pad("ROLL", W_ROLL) + "  " +
    pad("TYPE", W_TYPE) + "  " +
    pad("EXP", W_EXP) + "  " +
    pad("CREATED", W_DATE);
  const sep = "  " +
    "-".repeat(3) + "  " +
    "-".repeat(W_KEY) + "  " +
    "-".repeat(W_STATUS) + "  " +
    "-".repeat(W_ROLL) + "  " +
    "-".repeat(W_TYPE) + "  " +
    "-".repeat(W_EXP) + "  " +
    "-".repeat(W_DATE);

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
        const key = pad(r.key.slice(0, W_KEY), W_KEY);
        const status = pad(r.active ? "ACTIVE" : "PAUSED", W_STATUS);
        const roll = pad(r.rolloutPct + "%", W_ROLL, "left");
        const type = pad(r.type, W_TYPE);
        const exp = pad(r.experimentCount ? String(r.experimentCount) : "-", W_EXP, "left");
        const date = pad(shortDate(r.created), W_DATE);
        return (
          <Row key={i} className={isSelected ? "bright" : r.active ? "norm" : "dim"}>
            {`  ${num}  ${key}  ${status}  ${roll}  ${type}  ${exp}  ${date}`}
          </Row>
        );
      })}
      <Row>{" "}</Row>
      <Row className={error ? "red" : "dim"}>
        {"  " + (error ?? (filtered.length === 0
          ? activeFilter === "ALL" ? "NO FLAGS FOUND" : `NO ${activeFilter} FLAGS`
          : `ROW ${String(safeSelected + 1).padStart(3, "0")} OF ${filtered.length}`))}
      </Row>
      <Row className="dim">{" PF3=Back  ↑↓=Scroll  F7/F8=Page  F4=Filter  ENTER=Details             "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / FLAGS" cursorRow={cursorRow} cursorCol={cursorCol} />
    </Screen>
  );
}
