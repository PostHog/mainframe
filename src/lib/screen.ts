export const COLS = 80;
export const ROWS = 25;
export const CONTENT_ROWS = 24;

export function pad(s: string, len: number, side: "left" | "right" | "center" = "right"): string {
  if (s.length >= len) return s.slice(0, len);
  const diff = len - s.length;
  if (side === "right") return s + " ".repeat(diff);
  if (side === "left") return " ".repeat(diff) + s;
  const left = Math.floor(diff / 2);
  return " ".repeat(left) + s + " ".repeat(diff - left);
}

export function center(s: string, width: number = COLS): string {
  return pad(s, width, "center");
}

export function leftRight(left: string, right: string, width: number = COLS): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

export function fmtTime(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export const YEAR_OFFSET = -40;

export function mainframeNow(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + YEAR_OFFSET);
  return d;
}

export function fmtDate(d: Date = mainframeNow()): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${mo}/${dy}/${yy}`;
}

export function fmtYear(d: Date = mainframeNow()): string {
  return String(d.getFullYear());
}

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export function fmtLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export const POSTHOG_BANNER = [
  " ____   ___  ____ _____ _   _  ___   ____ ",
  "|  _ \\ / _ \\/ ___|_   _| | | |/ _ \\ / ___|",
  "| |_) | | | \\___ \\ | | | |_| | | | | |  _ ",
  "|  __/| |_| |___) || | |  _  | |_| | |_| |",
  "|_|    \\___/|____/ |_| |_| |_|\\___/ \\____|",
];
