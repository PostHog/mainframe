"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { COLS, center, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";

export type BrowseRow = { shortId: string; name: string; type: string; created: string };

const PAGE_SIZE = 14;

export function BrowseScreen({ rows, error }: { rows: BrowseRow[]; error: string | null }) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(0);
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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safeSelected = Math.min(selected, Math.max(0, rows.length - 1));
  const visible = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);

  const back = useCallback(() => router.push("/menu"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") { e.preventDefault(); back(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        if (rows.length === 0) return;
        const clamped = Math.min(selected, rows.length - 1);
        const row = rows[clamped];
        if (row) router.push(`/menu/browse/${row.shortId}`);
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, rows.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === "PageDown" || e.key === "F8") { e.preventDefault(); setPage((p) => Math.min(p + 1, totalPages - 1)); return; }
      if (e.key === "PageUp"   || e.key === "F7") { e.preventDefault(); setPage((p) => Math.max(p - 1, 0)); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, totalPages, rows.length, selected, router]);

  // keep selected within current page
  useEffect(() => {
    const start = page * PAGE_SIZE;
    const end = (page + 1) * PAGE_SIZE - 1;
    if (safeSelected < start) setSelected(start);
    if (safeSelected > end) setSelected(Math.min(end, rows.length - 1));
  }, [page, safeSelected, rows.length]);

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / INSIGHT BROWSER", `DATE: ${now.date}`) : " ";
  const timeLine = now ? leftRight(`PAGE ${page + 1} OF ${totalPages}   ${rows.length} INSIGHTS`, `TIME: ${now.time}`) : " ";

  const cursorRow = 7 + (safeSelected - page * PAGE_SIZE);
  const cursorCol = 3; // left margin

  return (
    <Screen>
      <Cursor row={cursorRow} col={cursorCol} hidden={!rows.length} />
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{"  ROW  " + pad("NAME", 44) + pad("TYPE", 9) + "CREATED   ID"}</Row>
      <Row className="dim">{"  ---  " + "-".repeat(43) + " " + "-".repeat(8) + " " + "-".repeat(10) + " " + "-".repeat(9)}</Row>
      {Array.from({ length: PAGE_SIZE }).map((_, i) => {
        const globalIdx = page * PAGE_SIZE + i;
        const row = visible[i];
        if (!row) return <Row key={i}>{" "}</Row>;
        const isSelected = globalIdx === safeSelected;
        const num = String(globalIdx + 1).padStart(3, "0");
        const name = pad(row.name.toUpperCase().slice(0, 43), 43);
        const type = pad(row.type, 8);
        const created = pad(row.created, 10);
        const id = pad(row.shortId, 9);
        const text = `  ${num}  ${name} ${type} ${created} ${id}`;
        return (
          <Row key={i} className={isSelected ? "bright" : "norm"}>
            {text}
          </Row>
        );
      })}
      <Row>{" "}</Row>
      <Row className={error ? "red" : "dim"}>
        {"  " + (error ?? (rows.length === 0 ? "NO INSIGHTS RETURNED — CHECK SCOPES OR PROJECT ACCESS" : `SELECTED ROW ${String(safeSelected + 1).padStart(3, "0")}`))}
      </Row>
      <Row className="dim">{" PF3=Back   F7=PrevPage   F8=NextPage   ↑↓=Navigate   ENTER=Open           "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / BROWSE" cursorRow={cursorRow} cursorCol={cursorCol} />
    </Screen>
  );
}
