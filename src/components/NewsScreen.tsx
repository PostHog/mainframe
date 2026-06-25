"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, Row } from "./Screen";
import { OIA } from "./OIA";
import { Cursor } from "./Cursor";
import { COLS, fmtDate, fmtLongDate, fmtTime, leftRight, mainframeNow, pad } from "@/lib/screen";
import posthog from "posthog-js";

export type NewsItem = {
  headline: string;
  byline: string;
  section: string;
  abstract: string;
  leadParagraph: string;
  url: string;
  pubDate: string;
  wordCount: number;
};

const VISIBLE_ROWS = 13;
const SECTION_COL_WIDTH = 14;
const DATE_COL_WIDTH = 8; // "MM/DD/YY"

function wordWrap(text: string, width: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  const paras = text.split(/\n+/);
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (candidate.length > width) {
        if (line) lines.push(line);
        if (w.length > width) {
          let rem = w;
          while (rem.length > width) {
            lines.push(rem.slice(0, width));
            rem = rem.slice(width);
          }
          line = rem;
        } else {
          line = w;
        }
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function shortDate(iso: string): string {
  // "1986-05-26T..." → "05/26/86"
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "--/--/--";
}

export function NewsScreen({
  items,
  dateIso,
  error,
}: {
  items: NewsItem[];
  dateIso: string;
  error: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "detail">("list");
  const [filterIdx, setFilterIdx] = useState(0);
  const [selected, setSelected] = useState(0);
  const [topRow, setTopRow] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);

  const articleDate = useMemo(() => new Date(dateIso), [dateIso]);
  const longDate = fmtLongDate(articleDate);

  useEffect(() => {
    const tick = () => {
      const d = mainframeNow();
      setNow({ date: fmtDate(d), time: fmtTime(d) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const sections = useMemo<string[]>(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.section, (counts.get(it.section) ?? 0) + 1);
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([s]) => s);
    return ["ALL", ...sorted];
  }, [items]);

  const safeFilterIdx = Math.min(filterIdx, Math.max(0, sections.length - 1));
  const activeFilter = sections[safeFilterIdx] ?? "ALL";

  const filtered = useMemo(
    () => (activeFilter === "ALL" ? items : items.filter((it) => it.section === activeFilter)),
    [items, activeFilter],
  );

  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));

  // Reset selection + scroll when the filter changes
  useEffect(() => {
    setSelected(0);
    setTopRow(0);
  }, [filterIdx]);

  // Keep selected row within the visible window
  useEffect(() => {
    if (filtered.length === 0) {
      if (topRow !== 0) setTopRow(0);
      return;
    }
    if (safeSelected < topRow) setTopRow(safeSelected);
    else if (safeSelected >= topRow + VISIBLE_ROWS) setTopRow(safeSelected - VISIBLE_ROWS + 1);
  }, [safeSelected, topRow, filtered.length]);

  const back = useCallback(() => router.push("/menu"), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (mode === "detail") {
        if (e.key === "F3" || e.key === "F12" || e.key === "Escape") {
          e.preventDefault();
          setMode("list");
          setScroll(0);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setScroll((s) => s + 1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setScroll((s) => Math.max(0, s - 1));
          return;
        }
        if (e.key === "PageDown" || e.key === "F8") {
          e.preventDefault();
          setScroll((s) => s + 10);
          return;
        }
        if (e.key === "PageUp" || e.key === "F7") {
          e.preventDefault();
          setScroll((s) => Math.max(0, s - 10));
          return;
        }
        // From detail view, F4 / Shift-F4 also cycle the underlying filter so
        // you can keep skimming a section without going back to the list.
        if (e.key === "F4") {
          e.preventDefault();
          setFilterIdx((i) =>
            e.shiftKey
              ? (i - 1 + sections.length) % sections.length
              : (i + 1) % sections.length,
          );
          return;
        }
        return;
      }

      // List mode
      if (e.key === "F3" || e.key === "F12" || e.key === "Escape") {
        e.preventDefault();
        back();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length === 0) return;
        const item = filtered[safeSelected];
        if (item) {
          posthog.capture("news_article_read", {
            headline: item.headline,
            section: item.section,
            pub_date: item.pubDate,
            word_count: item.wordCount,
          });
        }
        setMode("detail");
        setScroll(0);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return;
      }
      if (e.key === "PageDown" || e.key === "F8") {
        e.preventDefault();
        const next = Math.min(safeSelected + VISIBLE_ROWS, filtered.length - 1);
        setSelected(next);
        return;
      }
      if (e.key === "PageUp" || e.key === "F7") {
        e.preventDefault();
        const next = Math.max(safeSelected - VISIBLE_ROWS, 0);
        setSelected(next);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setSelected(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setSelected(Math.max(0, filtered.length - 1));
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        setFilterIdx((i) =>
          e.shiftKey
            ? (i - 1 + sections.length) % sections.length
            : (i + 1) % sections.length,
        );
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, back, filtered.length, safeSelected, sections.length]);

  if (mode === "detail") {
    const item = filtered[safeSelected];
    return (
      <DetailView
        item={item}
        articleDate={articleDate}
        longDate={longDate}
        now={now}
        scroll={scroll}
        totalCount={filtered.length}
        idx={safeSelected}
        filterLabel={activeFilter}
      />
    );
  }

  const dateLine = now
    ? leftRight("POSTHOG.MAINFRAME / THE NEW YORK TIMES", `DATE: ${now.date}`)
    : " ";

  // Long date banner (e.g. "MONDAY, MAY 26, 1986") + filter + counts
  const filterDisplay = activeFilter === "ALL" ? `ALL SECTIONS (${items.length})` : `${activeFilter.toUpperCase()} (${filtered.length}/${items.length})`;
  const timeLine = now
    ? leftRight(`${longDate}   |   ${filterDisplay}`.slice(0, COLS - 14), `TIME: ${now.time}`)
    : " ";

  // Header row uses Section column width = 14, Date column = 5, Headline = rest
  const headlineWidth = COLS - 2 - 3 - 2 - SECTION_COL_WIDTH - 1 - DATE_COL_WIDTH - 1 - 2; // see render below

  const cursorRow = 7 + (safeSelected - topRow);
  const cursorCol = 3;

  return (
    <Screen>
      <Cursor row={cursorRow} col={cursorCol} hidden={filtered.length === 0} />
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      <Row className="white">
        {"  ROW  " +
          pad("SECTION", SECTION_COL_WIDTH) + " " +
          pad("DATE", DATE_COL_WIDTH) + " " +
          pad("HEADLINE", headlineWidth)}
      </Row>
      <Row className="dim">
        {"  ---  " +
          "-".repeat(SECTION_COL_WIDTH) + " " +
          "-".repeat(DATE_COL_WIDTH) + " " +
          "-".repeat(headlineWidth)}
      </Row>
      {Array.from({ length: VISIBLE_ROWS }).map((_, i) => {
        const globalIdx = topRow + i;
        const it = filtered[globalIdx];
        if (!it) return <Row key={i}>{" "}</Row>;
        const isSelected = globalIdx === safeSelected;
        const num = String(globalIdx + 1).padStart(3, "0");
        const section = pad(it.section.toUpperCase().slice(0, SECTION_COL_WIDTH), SECTION_COL_WIDTH);
        const date = pad(shortDate(it.pubDate), DATE_COL_WIDTH);
        const headline = pad(it.headline.toUpperCase().slice(0, headlineWidth), headlineWidth);
        return (
          <Row key={i} className={isSelected ? "bright" : "norm"}>
            {`  ${num}  ${section} ${date} ${headline}`}
          </Row>
        );
      })}
      <Row>{" "}</Row>
      <Row className={error ? "red" : "dim"}>
        {"  " +
          (error ??
            (filtered.length === 0
              ? activeFilter === "ALL"
                ? "NO HEADLINES FOR THIS DATE"
                : `NO ARTICLES IN '${activeFilter.toUpperCase()}' — F4 TO CHANGE FILTER`
              : `ROW ${String(safeSelected + 1).padStart(3, "0")} OF ${filtered.length}   FILTER: ${activeFilter.toUpperCase()}`))}
      </Row>
      <Row className="dim">
        {" PF3=Back  ↑↓=Scroll  F7/F8=Page  F4=Filter  ENTER=Read                "}
      </Row>
      <OIA systemName="POSTHOG.MAINFRAME / NEWS" cursorRow={cursorRow} cursorCol={cursorCol} />
    </Screen>
  );
}

function DetailView({
  item,
  articleDate,
  longDate,
  now,
  scroll,
  totalCount,
  idx,
  filterLabel,
}: {
  item: NewsItem | undefined;
  articleDate: Date;
  longDate: string;
  now: { date: string; time: string } | null;
  scroll: number;
  totalCount: number;
  idx: number;
  filterLabel: string;
}) {
  if (!item) {
    return (
      <Screen>
        <Row className="red">{"  ARTICLE NOT FOUND"}</Row>
        <OIA systemName="POSTHOG.MAINFRAME / NEWS" cursorRow={25} cursorCol={1} />
      </Screen>
    );
  }

  const dateLine = now
    ? leftRight("POSTHOG.MAINFRAME / THE NEW YORK TIMES", `DATE: ${now.date}`)
    : " ";
  // Use the article's own pub_date for the published line (in case future
  // versions surface multi-day archives).
  const pubDate = item.pubDate
    ? fmtLongDate(new Date(item.pubDate))
    : longDate;
  const subTitle = `PUBLISHED ${pubDate}   |   ${item.section.toUpperCase()}   |   ${idx + 1}/${totalCount} IN '${filterLabel.toUpperCase()}'`;
  const timeLine = now ? leftRight(subTitle.slice(0, COLS - 14), `TIME: ${now.time}`) : " ";

  const BODY_WIDTH = 74;
  const BODY_ROWS = 16;

  const headlineLines = wordWrap(item.headline.toUpperCase(), BODY_WIDTH);
  const bylineLine = item.byline ? `BY ${item.byline.toUpperCase()}` : "";
  const abstractLines = wordWrap(item.abstract, BODY_WIDTH);
  const leadLines = item.leadParagraph && item.leadParagraph !== item.abstract
    ? wordWrap(item.leadParagraph, BODY_WIDTH)
    : [];

  type BodyLine = { text: string; cls: string };
  const allBody: BodyLine[] = [];
  for (const l of headlineLines) allBody.push({ text: l, cls: "bright" });
  if (bylineLine) {
    allBody.push({ text: "", cls: "dim" });
    allBody.push({ text: bylineLine, cls: "dim" });
  }
  if (abstractLines.length) {
    allBody.push({ text: "", cls: "dim" });
    for (const l of abstractLines) allBody.push({ text: l, cls: "norm" });
  }
  if (leadLines.length) {
    allBody.push({ text: "", cls: "dim" });
    for (const l of leadLines) allBody.push({ text: l, cls: "norm" });
  }

  const maxScroll = Math.max(0, allBody.length - BODY_ROWS);
  const safeScroll = Math.min(scroll, maxScroll);
  const visible = allBody.slice(safeScroll, safeScroll + BODY_ROWS);
  while (visible.length < BODY_ROWS) visible.push({ text: "", cls: "dim" });

  const moreBelow = allBody.length > safeScroll + BODY_ROWS;
  const moreAbove = safeScroll > 0;

  const indicator = moreAbove && moreBelow
    ? "MORE ABOVE AND BELOW   ↑↓=Scroll   F7/F8=Page"
    : moreBelow
      ? "MORE BELOW   ↓=Scroll   F8=Page"
      : moreAbove
        ? "MORE ABOVE   ↑=Scroll   F7=Page"
        : `WORD COUNT ${item.wordCount}   END OF ARTICLE`;

  // Suppress unused param warning until we surface it
  void articleDate;

  return (
    <Screen>
      <Row className="bright">{dateLine}</Row>
      <Row className="white">{timeLine}</Row>
      <Row className="dim">{"-".repeat(COLS)}</Row>
      <Row>{" "}</Row>
      {visible.map((l, i) => (
        <Row key={i} className={l.cls}>{"   " + l.text}</Row>
      ))}
      <Row>{" "}</Row>
      <Row className="dim">{"  " + indicator}</Row>
      <Row className="dim">
        {" PF3=Back to List   ↑↓=Scroll   F7/F8=Page   F4=Filter                  "}
      </Row>
      <OIA systemName="POSTHOG.MAINFRAME / NEWS / READ" cursorRow={25} cursorCol={1} />
    </Screen>
  );
}
