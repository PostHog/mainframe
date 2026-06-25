"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { signInAction } from "@/app/actions";
import { isRegion } from "@/lib/regions";
import { COLS, POSTHOG_BANNER, center, fmtDate, fmtTime, leftRight, mainframeNow } from "@/lib/screen";
import posthog from "posthog-js";

type FieldName = "account" | "region" | "userid" | "password";

const FIELDS: Record<FieldName, { row: number; col: number; width: number }> = {
  account:  { row: 16, col: 12, width: 8 },
  region:   { row: 16, col: 31, width: 2 },
  userid:   { row: 16, col: 44, width: 8 },
  password: { row: 16, col: 65, width: 8 },
};

const FIELD_ORDER: FieldName[] = ["account", "region", "userid", "password"];

type State = {
  values: Record<FieldName, string>;
  focused: FieldName;
  error: string | null;
  message: string | null;
  working: boolean;
  inhibit: string | null;
};

type Action =
  | { type: "type"; char: string }
  | { type: "backspace" }
  | { type: "tab"; dir: 1 | -1 }
  | { type: "clear" }
  | { type: "help" }
  | { type: "reject" }
  | { type: "submit-start" }
  | { type: "submit-error"; msg: string };

const INITIAL: State = {
  values: { account: "", region: "US", userid: "", password: "" },
  focused: "account",
  error: null,
  message: null,
  working: false,
  inhibit: null,
};

function reducer(state: State, action: Action): State {
  if (state.working && action.type !== "submit-error") return state;
  const fd = FIELDS[state.focused];
  const v = state.values[state.focused];

  switch (action.type) {
    case "type": {
      const c = state.focused === "password" ? action.char : action.char.toUpperCase();
      if (v.length >= fd.width) {
        const idx = FIELD_ORDER.indexOf(state.focused);
        if (idx < FIELD_ORDER.length - 1) {
          const next = FIELD_ORDER[idx + 1];
          const nv = state.values[next];
          if (nv.length < FIELDS[next].width) {
            return {
              ...state,
              focused: next,
              values: { ...state.values, [next]: nv + c },
              error: null,
              inhibit: null,
            };
          }
        }
        return { ...state, inhibit: "FULL" };
      }
      const newV = v + c;
      const idx = FIELD_ORDER.indexOf(state.focused);
      if (newV.length >= fd.width && idx < FIELD_ORDER.length - 1) {
        return {
          ...state,
          values: { ...state.values, [state.focused]: newV },
          focused: FIELD_ORDER[idx + 1],
          error: null,
          inhibit: null,
        };
      }
      return {
        ...state,
        values: { ...state.values, [state.focused]: newV },
        error: null,
        inhibit: null,
      };
    }
    case "backspace": {
      if (v.length > 0) {
        return {
          ...state,
          values: { ...state.values, [state.focused]: v.slice(0, -1) },
          error: null,
          inhibit: null,
        };
      }
      const idx = FIELD_ORDER.indexOf(state.focused);
      if (idx > 0) return { ...state, focused: FIELD_ORDER[idx - 1] };
      return { ...state, inhibit: "FIELD" };
    }
    case "tab": {
      const idx = FIELD_ORDER.indexOf(state.focused);
      const nextIdx = (idx + action.dir + FIELD_ORDER.length) % FIELD_ORDER.length;
      return { ...state, focused: FIELD_ORDER[nextIdx], inhibit: null };
    }
    case "clear":
      return INITIAL;
    case "help":
      return { ...state, message: "F1 HELP: TYPE REGION (US/EU). TAB BETWEEN FIELDS. ENTER TO CONNECT." };
    case "reject":
      return { ...state, inhibit: "KEY" };
    case "submit-start":
      return { ...state, working: true, error: null, message: null, inhibit: "SYSTEM" };
    case "submit-error":
      return { ...state, working: false, error: action.msg, inhibit: null };
  }
}

export function LoginScreen() {
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
    const region = stateRef.current.values.region.trim().toUpperCase();
    if (!isRegion(region)) {
      dispatch({ type: "submit-error", msg: `REGION '${region || "EMPTY"}' INVALID - USE US OR EU` });
      return;
    }
    dispatch({ type: "submit-start" });
    posthog.capture("sign_in_attempted", { region });
    try {
      const data = new FormData();
      data.set("region", region);
      await signInAction(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) return;
      dispatch({ type: "submit-error", msg: "CONNECT FAILED - CHECK CONFIG OR RETRY" });
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only intercept keys that aren't browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === "F1") { e.preventDefault(); dispatch({ type: "help" }); return; }
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "clear" });
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); dispatch({ type: "tab", dir: e.shiftKey ? -1 : 1 }); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault(); dispatch({ type: "tab", dir: 1 }); return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault(); dispatch({ type: "tab", dir: -1 }); return;
      }
      if (e.key === "Backspace") { e.preventDefault(); dispatch({ type: "backspace" }); return; }
      if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "type", char: e.key });
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  // Briefly flash the inhibit indicator
  useEffect(() => {
    if (!state.inhibit || state.inhibit === "SYSTEM") return;
    const id = setTimeout(() => dispatch({ type: "reject" }), 0);
    const clear = setTimeout(() => {
      // We dispatch a no-op-ish to clear inhibit by dispatching tab to current — instead, just no clear needed.
    }, 400);
    return () => {
      clearTimeout(id);
      clearTimeout(clear);
    };
  }, [state.inhibit]);

  const fd = FIELDS[state.focused];
  const v = state.values[state.focused];
  const cursorCol = fd.col + Math.min(v.length, fd.width - 1);

  const header = useMemo(() => {
    if (!now) return { dateLine: " ".repeat(COLS), timeLine: " ".repeat(COLS) };
    return {
      dateLine: leftRight("SVM0526A", `DATE: ${now.date}`),
      timeLine: leftRight("SYSTEM: POSTHOG.MAINFRAME", `TIME: ${now.time}`),
    };
  }, [now]);

  const statusLine = state.error
    ? state.error
    : state.working
      ? "CONNECTING TO POSTHOG.COM ..."
      : state.message
        ? state.message
        : "TYPE INFORMATION   TAB BETWEEN FIELDS   ENTER TO CONNECT";

  return (
    <Screen>
      <Cursor row={fd.row} col={cursorCol} hidden={state.working} />
      <Row className="bright">{header.dateLine}</Row>
      <Row className="bright">{header.timeLine}</Row>
      <Row>{leftRight("TERMID: WEB3270-01", "")}</Row>
      <Row>{"CUSTOMER ASSISTANCE: ENTER \"HELP\" OR PRESS PF1"}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">{center("WELCOME TO")}</Row>
      {POSTHOG_BANNER.map((line, i) => (
        <Row key={i} className="bright">{center(line)}</Row>
      ))}
      <Row>{" "}</Row>
      <Row className="white">{center("MAINFRAME TERMINAL SERVICES")}</Row>
      <Row>{" "}</Row>
      <FieldsRow values={state.values} />
      <Row>{" "}</Row>
      <Row className="dim">{center("AUTH MODE: OAUTH-3270  ::  ENTER TO CONNECT TO POSTHOG.COM")}</Row>
      <Row>{" "}</Row>
      <Row className={state.error ? "red" : "dim"}>{center(statusLine)}</Row>
      <Row>{" "}</Row>
      <Row>{" "}</Row>
      <Row className="dim">{" PF1=Help    PF3=Clear    PF12=Cancel    TAB=Next    ENTER=Submit         "}</Row>
      <OIA
        systemName="POSTHOG.MAINFRAME"
        cursorRow={fd.row}
        cursorCol={cursorCol}
        inhibit={state.inhibit}
      />
    </Screen>
  );
}

type Seg = { text: string; cls: "dim" | "bright" | "norm" };

function FieldsRow({ values }: { values: Record<FieldName, string> }) {
  const segs: Seg[] = [
    { text: " ACCOUNT.. ", cls: "dim" },
    { text: values.account, cls: "bright" },
    { text: "_".repeat(FIELDS.account.width - values.account.length), cls: "dim" },
    { text: "  REGION.. ", cls: "dim" },
    { text: values.region, cls: "bright" },
    { text: "_".repeat(FIELDS.region.width - values.region.length), cls: "dim" },
    { text: "  USERID.. ", cls: "dim" },
    { text: values.userid, cls: "bright" },
    { text: "_".repeat(FIELDS.userid.width - values.userid.length), cls: "dim" },
    { text: "  PASSWORD.. ", cls: "dim" },
    { text: " ".repeat(values.password.length), cls: "bright" },
    { text: "_".repeat(FIELDS.password.width - values.password.length), cls: "dim" },
  ];
  return (
    <div className="row">
      {segs.map((s, i) => (
        <span key={i} className={s.cls}>{s.text}</span>
      ))}
    </div>
  );
}
