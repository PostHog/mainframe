"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { COLS, center, fmtDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import type { InsightMeta } from "./InsightViewer";

const BODY_ROWS = 18;

export function UnknownInsight({ meta, raw, kind }: { meta: InsightMeta; raw: unknown; kind: string }) {
  const router = useRouter();
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

  const back = useCallback(() => router.push("/menu/browse"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") {
        e.preventDefault();
        back();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const dateLine = now
    ? leftRight(("INSIGHT " + meta.shortId.toUpperCase() + " " + meta.name.toUpperCase()).slice(0, COLS - 16), `DATE: ${now.date}`)
    : " ";
  const timeLine = now ? leftRight(`UNSUPPORTED INSIGHT / KIND: ${kind.toUpperCase()}`, `TIME: ${now.time}`) : " ";

  // Pretty-print first ~16 lines of raw response so the user can see what came back.
  let preview: string[] = [];
  try {
    const pretty = JSON.stringify(raw, null, 2);
    preview = pretty.split("\n").slice(0, BODY_ROWS - 4);
  } catch {
    preview = [String(raw).slice(0, COLS - 4)];
  }

  const body: string[] = [];
  body.push(center("VIEW NOT IMPLEMENTED FOR THIS INSIGHT TYPE", COLS - 4));
  body.push("");
  body.push("  RAW RESPONSE PREVIEW:");
  body.push("");
  for (const line of preview) body.push("  " + line.slice(0, COLS - 4));
  while (body.length < BODY_ROWS) body.push("");

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      {body.slice(0, BODY_ROWS).map((line, i) => (
        <Row key={i} className={i === 0 ? "red" : "dim"}>{line || " "}</Row>
      ))}
      <Row>{" "}</Row>
      <Row className="dim">{pad(" PF3=Back   ESC=Back   PRESS PF3 TO RETURN TO INSIGHT BROWSER", COLS)}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / VIEW" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
