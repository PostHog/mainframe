"use client";

import { useEffect, useRef, useState } from "react";
import { Screen, Row } from "./Screen";
import { center, COLS, fmtYear, leftRight } from "@/lib/screen";

type Step =
  | { kind: "line"; text: string; cls?: string; pause?: number }
  | { kind: "wait"; ms: number }
  | { kind: "check"; label: string; result?: string; pause?: number };

const YEAR = fmtYear();

const BOOT_SCRIPT: Step[] = [
  { kind: "wait", ms: 350 },
  { kind: "line", text: "POSTHOG 9000 SYSTEM CONTROL PROGRAM v3.7", cls: "bright" },
  { kind: "line", text: `(C) COPYRIGHT POSTHOG INC. ${YEAR} - ALL RIGHTS RESERVED`, cls: "dim" },
  { kind: "line", text: "" },
  { kind: "line", text: "INITIALIZING MAINFRAME SUBSYSTEMS . . ." },
  { kind: "line", text: "" },
  { kind: "check", label: "BIOS-ROM CHECKSUM", pause: 90 },
  { kind: "check", label: "MEMORY ALLOCATION TABLE (640K BASE / 0K EXT)", pause: 70 },
  { kind: "check", label: "CRT ADAPTER  (P1 PHOSPHOR, 80x25)", pause: 80 },
  { kind: "check", label: "KEYBOARD CONTROLLER  (3270 EMULATION)", pause: 60 },
  { kind: "check", label: "TCP/IP STACK", pause: 90 },
  { kind: "check", label: "OAUTH-3270 BRIDGE  (PKCE+DCR)", pause: 80 },
  { kind: "check", label: "TERMINAL ID  WEB3270-01", pause: 60 },
  { kind: "line", text: "" },
  { kind: "line", text: "ESTABLISHING SESSION WITH POSTHOG.COM . . .", cls: "bright" },
  { kind: "wait", ms: 380 },
  { kind: "line", text: "SESSION READY.", cls: "bright" },
  { kind: "line", text: "" },
  { kind: "line", text: "PRESS ANY KEY TO BEGIN", cls: "white" },
];

type RenderedLine = { text: string; cls: string };

const COLON_PAD_TO = 56;

function checkLine(label: string, result = "OK"): string {
  const dots = Math.max(3, COLON_PAD_TO - label.length);
  return `${label} ${".".repeat(dots)} ${result}`;
}

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<RenderedLine[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let stepIdx = 0;

    async function run() {
      for (; stepIdx < BOOT_SCRIPT.length; stepIdx++) {
        if (cancelled) return;
        const step = BOOT_SCRIPT[stepIdx];
        if (step.kind === "wait") {
          await sleep(step.ms);
          continue;
        }
        if (step.kind === "line") {
          await typeLine(step.text, step.cls ?? "norm");
          await sleep(step.pause ?? 40);
          continue;
        }
        if (step.kind === "check") {
          await typeLine(checkLine(step.label, ""), "dim");
          await sleep(step.pause ?? 60);
          // patch the last line with OK
          if (!cancelled) {
            setLines((ls) => {
              const next = [...ls];
              next[next.length - 1] = { text: checkLine(step.label, step.result ?? "OK"), cls: "norm" };
              return next;
            });
          }
          await sleep(20);
        }
      }
      if (!cancelled) finish();
    }

    function typeLine(text: string, cls: string): Promise<void> {
      return new Promise((resolve) => {
        let i = 0;
        const speed = text.length > 30 ? 8 : 12;
        if (text === "") {
          setLines((ls) => [...ls, { text: "", cls }]);
          resolve();
          return;
        }
        setTyping("");
        function tick() {
          if (cancelled) {
            resolve();
            return;
          }
          i++;
          const chunk = text.slice(0, i);
          setTyping(chunk);
          if (i >= text.length) {
            setLines((ls) => [...ls, { text, cls }]);
            setTyping(null);
            resolve();
            return;
          }
          setTimeout(tick, speed);
        }
        tick();
      });
    }

    function sleep(ms: number) {
      return new Promise<void>((r) => setTimeout(r, ms));
    }

    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      try {
        sessionStorage.setItem("mf:booted", "1");
      } catch {
        /* private mode */
      }
      onDone();
    }

    function skip() {
      cancelled = true;
      finish();
    }

    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      skip();
    }

    window.addEventListener("keydown", onKey);
    void run();
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  const total = lines.length + (typing !== null ? 1 : 0);
  const visible = lines.slice(Math.max(0, total - 22));
  const stillTyping = typing;

  return (
    <Screen>
      <div className="boot">
        <Row className="bright">{leftRight("POSTHOG 9000  TERMINAL BOOT", "MFRAME-IPL")}</Row>
        <Row className="dim">{"-".repeat(COLS)}</Row>
        {visible.map((l, i) => (
          <Row key={i} className={l.cls}>{l.text || " "}</Row>
        ))}
        {stillTyping !== null && (
          <Row className="norm">{stillTyping}</Row>
        )}
        <div className="boot-skip dim">{center("PRESS ANY KEY TO SKIP", COLS)}</div>
      </div>
      <Row className="dim">
        {leftRight("4 B  X SYSTEM", `BOOT     ${pad2(lines.length)}/${pad2(BOOT_SCRIPT.length)}`)}
      </Row>
    </Screen>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
