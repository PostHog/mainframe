"use client";

import type { CSSProperties } from "react";

type Props = {
  row: number;
  col: number;
  hidden?: boolean;
  steady?: boolean;
};

export function Cursor({ row, col, hidden, steady }: Props) {
  if (hidden) return null;
  const style = {
    "--cur-row": row,
    "--cur-col": col,
  } as CSSProperties;
  return <div className={`cursor-blk${steady ? "" : " blink"}`} style={style} aria-hidden />;
}
