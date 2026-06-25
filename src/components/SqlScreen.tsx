"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { runHogQueryAction, type QueryActionResult } from "@/app/actions";
import { COLS, center, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import posthog from "posthog-js";

const EDITOR_START_ROW = 6;
const EDITOR_HEIGHT = 5;
const EDITOR_LEFT_COL = 5;
const EDITOR_INNER_WIDTH = 74; // 80 - 4 margin - 2 right slack
const RESULT_START_ROW = 13;
const RESULT_HEIGHT = 9;
const STATUS_ROW = 23;
const FOOTER_ROW = 24;

type Result = QueryActionResult | null;

type State = {
  buffer: string;
  result: Result;
  running: boolean;
  inhibit: string | null;
};

const STARTER = "SELECT event, count() AS c\nFROM events\nWHERE timestamp > now() - INTERVAL 1 DAY\nGROUP BY event\nORDER BY c DESC\nLIMIT 10";

const INITIAL: State = { buffer: STARTER, result: null, running: false, inhibit: null };

type Action =
  | { type: "type"; char: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "run-start" }
  | { type: "run-result"; result: QueryActionResult };

function reducer(state: State, action: Action): State {
  if (state.running && action.type !== "run-result") return state;
  switch (action.type) {
    case "type": {
      const lastLine = state.buffer.split("\n").pop() ?? "";
      if (lastLine.length >= EDITOR_INNER_WIDTH) return { ...state, inhibit: "FULL" };
      return { ...state, buffer: state.buffer + action.char, inhibit: null };
    }
    case "enter": {
      const lineCount = state.buffer.split("\n").length;
      if (lineCount >= EDITOR_HEIGHT) return { ...state, inhibit: "ROW" };
      return { ...state, buffer: state.buffer + "\n", inhibit: null };
    }
    case "backspace": {
      if (state.buffer.length === 0) return { ...state, inhibit: "EMPTY" };
      return { ...state, buffer: state.buffer.slice(0, -1), inhibit: null };
    }
    case "clear":
      return { ...state, buffer: "", result: null, inhibit: null };
    case "run-start":
      return { ...state, running: true, inhibit: "SYSTEM", result: null };
    case "run-result":
      return { ...state, running: false, inhibit: null, result: action.result };
  }
}

export function SqlScreen() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INITIAL);
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

  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(async () => {
    dispatch({ type: "run-start" });
    const result = await runHogQueryAction(stateRef.current.buffer);
    if (!result.ok) {
      posthog.capture("hogql_query_failed", {
        status: result.status,
        error: result.message,
      });
    }
    dispatch({ type: "run-result", result });
  }, []);

  const back = useCallback(() => router.push("/menu"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (stateRef.current.running && e.key !== "F3") { e.preventDefault(); return; }
      if (e.key === "F3" || e.key === "F12") { e.preventDefault(); back(); return; }
      if (e.key === "F8") { e.preventDefault(); void run(); return; }
      if (e.key === "F1") { e.preventDefault(); return; }
      if (e.key === "Enter") { e.preventDefault(); dispatch({ type: "enter" }); return; }
      if (e.key === "Backspace") { e.preventDefault(); dispatch({ type: "backspace" }); return; }
      if (e.key === "Escape") { e.preventDefault(); dispatch({ type: "clear" }); return; }
      if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "type", char: e.key });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, run]);

  // Cursor position: end of last editor line
  const editorLines = state.buffer.split("\n");
  const cursorEditorRow = Math.min(editorLines.length, EDITOR_HEIGHT) - 1;
  const cursorCol = EDITOR_LEFT_COL + Math.min(editorLines[editorLines.length - 1]?.length ?? 0, EDITOR_INNER_WIDTH);
  const cursorRow = EDITOR_START_ROW + cursorEditorRow;

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / HOGQL QUERY EDITOR", `DATE: ${now.date}`) : " ";
  const timeLine = now ? leftRight("PF8=RUN  PF3=EXIT  PF12=CLEAR", `TIME: ${now.time}`) : " ";

  const editorRows: string[] = [];
  for (let i = 0; i < EDITOR_HEIGHT; i++) {
    const line = editorLines[i] ?? "";
    editorRows.push(line.slice(0, EDITOR_INNER_WIDTH));
  }

  const statusLine = (() => {
    if (state.running) return "EXECUTING QUERY ...";
    if (!state.result) return "READY. PRESS PF8 TO RUN, PF3 TO RETURN.";
    if (!state.result.ok) {
      return `ERROR ${state.result.status}: ${state.result.message}`.slice(0, COLS - 4);
    }
    const r = state.result.result;
    const rows = r.results.length;
    return `${rows} ROW${rows === 1 ? "" : "S"} RETURNED${r.hasMore ? "  (TRUNCATED)" : ""}`;
  })();

  return (
    <Screen>
      <Cursor row={cursorRow} col={cursorCol} hidden={state.running} />
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{"  QUERY:"}</Row>
      {editorRows.map((line, i) => (
        <Row key={i} className="bright">
          {"  > " + pad(line, EDITOR_INNER_WIDTH)}
        </Row>
      ))}
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row className="white">{"  RESULT:"}</Row>
      <ResultPane result={state.result} running={state.running} />
      <Row className={state.result && !state.result.ok ? "red" : "dim"}>{"  " + statusLine}</Row>
      <Row className="dim">{" PF3=Back   PF8=Run   PF12=Clear   ENTER=Newline   ESC=Clear            "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / HOGQL" cursorRow={cursorRow} cursorCol={cursorCol} inhibit={state.inhibit} />
    </Screen>
  );
}

function ResultPane({ result, running }: { result: Result; running: boolean }) {
  const blanks = (n: number) =>
    Array.from({ length: n }).map((_, i) => (
      <Row key={`blk-${i}`}>{" "}</Row>
    ));

  if (running) return <>{blanks(RESULT_HEIGHT - 1)}<Row className="dim">{"  ... WORKING ..."}</Row></>;
  if (!result) return <>{blanks(RESULT_HEIGHT)}</>;
  if (!result.ok) {
    const lines: string[] = [];
    if (result.body) {
      for (const chunk of result.body.split("\n")) {
        if (lines.length >= RESULT_HEIGHT) break;
        lines.push(chunk.slice(0, COLS - 4));
      }
    }
    while (lines.length < RESULT_HEIGHT) lines.push("");
    return (
      <>
        {lines.map((l, i) => (
          <Row key={i} className={i === 0 ? "red" : "dim"}>{"  " + l}</Row>
        ))}
      </>
    );
  }

  const { columns, results } = result.result;
  if (columns.length === 0 || results.length === 0) {
    return (
      <>
        <Row className="dim">{"  (NO ROWS)"}</Row>
        {blanks(RESULT_HEIGHT - 1)}
      </>
    );
  }

  // Auto-size columns: each col width = max(headerLen, maxValLen), capped to fit total
  const maxByCol = columns.map((c, i) => {
    let max = c.length;
    for (const row of results.slice(0, 100)) {
      const v = fmtCell(row[i]);
      if (v.length > max) max = v.length;
    }
    return Math.min(max, 30);
  });
  const TOTAL = COLS - 4; // " " + "  " right margin
  const sumW = maxByCol.reduce((a, b) => a + b, 0) + (columns.length - 1) * 2; // 2-space gap
  let widths = maxByCol;
  if (sumW > TOTAL) {
    // Scale down proportionally
    const scale = (TOTAL - (columns.length - 1) * 2) / maxByCol.reduce((a, b) => a + b, 0);
    widths = maxByCol.map((w) => Math.max(3, Math.floor(w * scale)));
  }

  const headerLine = "  " + widths.map((w, i) => pad(columns[i].slice(0, w).toUpperCase(), w)).join("  ");
  const sepLine    = "  " + widths.map((w) => "-".repeat(w)).join("  ");
  const dataRows: string[] = [];
  const maxDataRows = RESULT_HEIGHT - 2; // header + sep
  for (let r = 0; r < Math.min(results.length, maxDataRows); r++) {
    const row = results[r];
    dataRows.push("  " + widths.map((w, i) => pad(fmtCell(row[i]).slice(0, w), w)).join("  "));
  }
  while (dataRows.length < maxDataRows) dataRows.push("");

  return (
    <>
      <Row className="white">{headerLine}</Row>
      <Row className="dim">{sepLine}</Row>
      {dataRows.map((l, i) => (
        <Row key={i} className="bright">{l}</Row>
      ))}
    </>
  );
}

function fmtCell(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
