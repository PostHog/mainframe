"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { runMenuOption, signOutAction } from "@/app/actions";
import { COLS, center, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";

type Option = { key: string; label: string; desc: string; available: boolean };

const OPTIONS: Option[] = [
  { key: "1", label: "BROWSE  ", desc: "BROWSE POSTHOG INSIGHTS",                  available: true  },
  { key: "2", label: "FLAGS   ", desc: "FEATURE FLAGS AND ROLLOUTS",               available: true  },
  { key: "3", label: "REPLAY  ", desc: "INSPECT SESSION REPLAYS",                  available: false },
  { key: "4", label: "ERRORS  ", desc: "ERROR TRACKING - ISSUES AND EVENTS",       available: false },
  { key: "5", label: "SQL     ", desc: "HOGQL QUERY EDITOR",                       available: true  },
  { key: "6", label: "EXPER   ", desc: "EXPERIMENTS AND VARIANTS",                 available: true  },
  { key: "7", label: "EVENTS  ", desc: "LIVE EVENT STREAM",                        available: false },
  { key: "N", label: "NEWS    ", desc: "MORNING BULLETIN FROM THE NEW YORK TIMES", available: true  },
  { key: "U", label: "UTILITY ", desc: "TERMINAL UTILITIES",                       available: false },
  { key: "S", label: "SETTINGS", desc: "PROJECT AND USER PREFERENCES",             available: false },
  { key: "X", label: "EXIT    ", desc: "TERMINATE SESSION AND LOGOFF",             available: true  },
];

// Row arithmetic: 4 header + 1 blank + 1 SELECT + 1 blank + 11 options + 1 blank
// + 1 status + 1 blank = 21 → COMMAND on row 22, footer 23, OIA 24.
const COMMAND_ROW = 22;
const COMMAND_PROMPT = "COMMAND ===> ";
const COMMAND_COL_START = COMMAND_PROMPT.length + 1; // 1-indexed grid col
const COMMAND_MAX = COLS - COMMAND_COL_START;

type State = {
  command: string;
  error: string | null;
  message: string | null;
  inhibit: string | null;
  working: boolean;
};

const INITIAL: State = { command: "", error: null, message: null, inhibit: null, working: false };

type Action =
  | { type: "type"; char: string }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "submit-result"; error?: string; message?: string }
  | { type: "submit-start" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "type": {
      if (state.command.length >= COMMAND_MAX) return { ...state, inhibit: "FULL" };
      return { ...state, command: state.command + action.char.toUpperCase(), error: null, inhibit: null };
    }
    case "backspace":
      if (state.command.length === 0) return { ...state, inhibit: "FIELD" };
      return { ...state, command: state.command.slice(0, -1), inhibit: null };
    case "clear":
      return { ...state, command: "", error: null, message: null, inhibit: null };
    case "submit-start":
      return { ...state, working: true, inhibit: "SYSTEM", error: null, message: null };
    case "submit-result":
      return {
        ...state,
        working: false,
        inhibit: null,
        command: "",
        error: action.error ?? null,
        message: action.message ?? null,
      };
  }
}

export function MenuScreen({ email, name, region }: { email: string; name: string; region: string }) {
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

  const submit = useCallback(async () => {
    const cmd = stateRef.current.command;
    dispatch({ type: "submit-start" });
    try {
      const res = await runMenuOption(cmd);
      dispatch({ type: "submit-result", error: res.error, message: res.message });
    } catch (err) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) return;
      dispatch({ type: "submit-result", error: "COMMAND FAILED" });
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (stateRef.current.working) {
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); submit(); return; }
      if (e.key === "F3" || e.key === "F12") {
        e.preventDefault();
        dispatch({ type: "submit-start" });
        void signOutAction().catch(() => dispatch({ type: "submit-result", error: "LOGOFF FAILED" }));
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        dispatch({ type: "submit-result", message: "F1 HELP: TYPE OPTION NUMBER/LETTER, PRESS ENTER. X TO LOGOFF." });
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); dispatch({ type: "clear" }); return; }
      if (e.key === "Backspace") { e.preventDefault(); dispatch({ type: "backspace" }); return; }
      if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "type", char: e.key });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  const cursorCol = Math.min(COMMAND_COL_START + state.command.length, COLS);

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME PRIMARY OPTION MENU", `DATE: ${now.date}`) : " ";
  const timeLine = now ? leftRight(`USER: ${name.toUpperCase().slice(0, 30)}`, `TIME: ${now.time}`) : " ";
  const regionLine = leftRight(`REGION: ${region}`, `EMAIL: ${email.toUpperCase().slice(0, 40)}`);

  const status = state.error ?? state.message ?? (state.working ? "EXECUTING ..." : "READY");
  const statusCls = state.error ? "red" : state.message ? "dim" : "dim";

  return (
    <Screen>
      <Cursor row={COMMAND_ROW} col={cursorCol} hidden={state.working} />
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{regionLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{"   SELECT AN OPTION:"}</Row>
      <Row>{" "}</Row>
      {OPTIONS.map((o) => (
        <Row key={o.key}>
          {"     "}
          <span className={o.available ? "bright" : "dim"}>{o.key}</span>
          {"  "}
          <span className={o.available ? "white" : "dim"}>{o.label}</span>
          {"  "}
          <span className="dim">{pad(o.desc, 47)}</span>
          {o.available
            ? <span>{"       "}</span>
            : <span className="white">{" [SOON]"}</span>}
        </Row>
      ))}
      <Row>{" "}</Row>
      <Row className={statusCls}>{"  " + status}</Row>
      <Row>{" "}</Row>
      <Row>
        <span className="dim">{COMMAND_PROMPT}</span>
        <span className="bright">{state.command}</span>
      </Row>
      <Row className="dim">{" PF1=Help    PF3=Logoff   ENTER=Run                                            "}</Row>
      <OIA
        systemName="POSTHOG.MAINFRAME / ONLINE"
        cursorRow={COMMAND_ROW}
        cursorCol={cursorCol}
        inhibit={state.inhibit}
      />
    </Screen>
  );
}
