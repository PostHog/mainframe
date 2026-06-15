"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { COLS, fmtDate, fmtLongDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import type { FeatureFlag, FeatureFlagGroup, FeatureFlagProperty } from "@/lib/posthog-api";

type Line = { text: string; cls: string };

function describeProperty(p: FeatureFlagProperty): string {
  const k = (p.key ?? "?").toUpperCase();
  const op = (p.operator ?? "EQ").toUpperCase().replace(/_/g, " ");
  const v = Array.isArray(p.value)
    ? p.value.map((x) => JSON.stringify(x)).join(", ")
    : typeof p.value === "string" ? p.value : JSON.stringify(p.value);
  return `${k} ${op} ${v}`;
}

function describeGroup(g: FeatureFlagGroup, idx: number): string {
  const pct = g.rollout_percentage ?? 100;
  const pctStr = `${String(pct).padStart(3, " ")}%`;
  const props = g.properties ?? [];
  const conds = props.length === 0 ? "EVERYONE" : props.map(describeProperty).join(" AND ");
  return `GROUP ${idx + 1}   ${pctStr}   ${conds}`;
}

export function FlagDetail({ flag, error, flagKey }: { flag: FeatureFlag | null; error: string | null; flagKey?: string }) {
  const router = useRouter();
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const tick = () => {
      const d = mainframeNow();
      setNow({ date: fmtDate(d), time: fmtTime(d) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const back = useCallback(() => router.push("/menu/flags"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") { e.preventDefault(); back(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setScroll((s) => s + 1); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setScroll((s) => Math.max(0, s - 1)); return; }
      if (e.key === "PageDown" || e.key === "F8") { e.preventDefault(); setScroll((s) => s + 10); return; }
      if (e.key === "PageUp" || e.key === "F7")   { e.preventDefault(); setScroll((s) => Math.max(0, s - 10)); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const dateLine = now ? leftRight("POSTHOG.MAINFRAME / FLAG DETAIL", `DATE: ${now.date}`) : " ";

  if (!flag) {
    const errorTitle = now ? leftRight(`FLAG '${flagKey ?? "?"}'`, `TIME: ${now.time}`) : " ";
    return (
      <Screen>
        <Row className="bright">{dateLine}</Row>
        <Row className="red">{errorTitle}</Row>
        <Row className="dim">{"-".repeat(COLS)}</Row>
        <Row>{" "}</Row>
        <Row className="red">{"  " + (error ?? "FLAG NOT FOUND")}</Row>
        {Array.from({ length: 17 }).map((_, i) => (
          <Row key={i}>{" "}</Row>
        ))}
        <Row className="dim">{" PF3=Back to Flag List                                                       "}</Row>
        <OIA systemName="POSTHOG.MAINFRAME / FLAGS" cursorRow={25} cursorCol={1} />
      </Screen>
    );
  }

  const status = flag.active ? "ACTIVE" : "PAUSED";
  const type = flag.filters?.multivariate?.variants?.length ? "MULTIVARIATE" : "BOOLEAN";
  const subTitle = `${flag.key.toUpperCase()}   ${status}   ${type}`;
  const timeLine = now ? leftRight(subTitle.slice(0, COLS - 14), `TIME: ${now.time}`) : " ";

  // Build body lines.
  const lines: Line[] = [];
  const createdBy = flag.created_by?.email ?? flag.created_by?.first_name ?? "UNKNOWN";
  const createdAt = flag.created_at ? fmtLongDate(new Date(flag.created_at)) : "UNKNOWN";

  lines.push({ text: "  NAME:        " + (flag.name || "(NO NAME)").toUpperCase().slice(0, 60), cls: "bright" });
  lines.push({ text: "  KEY:         " + flag.key.slice(0, 60), cls: "norm" });
  lines.push({ text: "  STATUS:      " + status, cls: flag.active ? "bright" : "dim" });
  lines.push({ text: "  TYPE:        " + type, cls: "norm" });
  lines.push({ text: "  CREATED:     " + createdAt + " BY " + createdBy.toUpperCase().slice(0, 30), cls: "dim" });
  if (flag.experiment_set && flag.experiment_set.length > 0) {
    lines.push({ text: "  EXPERIMENTS: " + flag.experiment_set.length + " (IDS: " + flag.experiment_set.slice(0, 8).join(", ") + ")", cls: "norm" });
  }
  lines.push({ text: "", cls: "dim" });

  // Rollout groups
  const groups = flag.filters?.groups ?? [];
  lines.push({ text: "  ROLLOUT GROUPS:", cls: "white" });
  if (groups.length === 0) {
    lines.push({ text: "    (no groups configured)", cls: "dim" });
  } else {
    for (let i = 0; i < groups.length; i++) {
      const line = "    " + describeGroup(groups[i], i);
      // Wrap long group lines
      if (line.length <= COLS - 2) {
        lines.push({ text: line, cls: "norm" });
      } else {
        // Split conditions onto continuation lines
        const head = line.slice(0, COLS - 2);
        lines.push({ text: head, cls: "norm" });
        let rest = line.slice(COLS - 2);
        while (rest.length > 0) {
          lines.push({ text: "        " + rest.slice(0, COLS - 10), cls: "dim" });
          rest = rest.slice(COLS - 10);
        }
      }
    }
  }

  // Variants
  const variants = flag.filters?.multivariate?.variants ?? [];
  if (variants.length > 0) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  VARIANTS:", cls: "white" });
    for (const v of variants) {
      const pct = `${String(v.rollout_percentage).padStart(3, " ")}%`;
      const name = (v.name || v.key).slice(0, 50);
      lines.push({ text: `    ${pct}  ${v.key.padEnd(20)} ${name}`, cls: "norm" });
    }
  }

  // Payloads
  const payloads = flag.filters?.payloads ?? {};
  const payloadKeys = Object.keys(payloads);
  if (payloadKeys.length > 0) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  PAYLOADS:", cls: "white" });
    for (const k of payloadKeys) {
      const v = String(payloads[k] ?? "").slice(0, 60);
      lines.push({ text: `    ${k.padEnd(20)} ${v}`, cls: "dim" });
    }
  }

  // Tags
  if (flag.tags && flag.tags.length > 0) {
    lines.push({ text: "", cls: "dim" });
    lines.push({ text: "  TAGS:        " + flag.tags.join(", ").toUpperCase().slice(0, 60), cls: "dim" });
  }

  const BODY_ROWS = 18;
  const maxScroll = Math.max(0, lines.length - BODY_ROWS);
  const safeScroll = Math.min(scroll, maxScroll);
  const visible = lines.slice(safeScroll, safeScroll + BODY_ROWS);
  while (visible.length < BODY_ROWS) visible.push({ text: "", cls: "dim" });

  const moreAbove = safeScroll > 0;
  const moreBelow = lines.length > safeScroll + BODY_ROWS;
  const indicator = moreAbove && moreBelow
    ? "MORE ABOVE AND BELOW   ↑↓=Scroll   F7/F8=Page"
    : moreBelow ? "MORE BELOW   ↓=Scroll   F8=Page"
    : moreAbove ? "MORE ABOVE   ↑=Scroll   F7=Page"
    : `LINES ${lines.length}   END OF DETAIL`;

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className={flag.active ? "white" : "dim"}>{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      {visible.map((l, i) => (
        <Row key={i} className={l.cls}>{l.text || " "}</Row>
      ))}
      <Row className="dim">{"  " + indicator}</Row>
      <Row className="dim">{" PF3=Back to Flag List   ↑↓=Scroll   F7/F8=Page                          "}</Row>
      <OIA systemName="POSTHOG.MAINFRAME / FLAGS / DETAIL" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
