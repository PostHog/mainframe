"use client";

import { useEffect, useState } from "react";
import { COLS, leftRight } from "@/lib/screen";

type Props = {
  systemName?: string;
  cursorRow?: number;
  cursorCol?: number;
  inhibit?: string | null;
};

export function OIA({ systemName = "POSTHOG.MAINFRAME", cursorRow = 1, cursorCol = 1, inhibit }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  const left = `4 B  ${inhibit ? "X " + inhibit : "  "}`;
  const cursorPos = `${String(cursorRow).padStart(3, "0")}/${String(cursorCol).padStart(3, "0")}`;
  const right = `KB     ${cursorPos}`;
  const center = systemName;
  const padLeft = Math.max(1, Math.floor((COLS - center.length) / 2) - left.length);
  const padRight = Math.max(1, COLS - left.length - padLeft - center.length - right.length);
  const line = left + " ".repeat(padLeft) + center + " ".repeat(padRight) + right;
  return (
    <div className="row dim" aria-label="operator information area">
      {leftRight(line.slice(0, COLS), "", COLS)}
    </div>
  );
}
