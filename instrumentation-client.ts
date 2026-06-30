import posthog, { type CaptureResult } from "posthog-js";

// Patterns that identify Next.js dev-mode / HMR framework noise. These exceptions
// are thrown by Turbopack's hot-reload machinery while a developer edits files
// locally (e.g. an HMR refresh dispatching a router action before the App Router
// has initialized). No real user ever hits them, so we keep them out of error
// tracking.
const NEXT_HMR_NOISE = [
  "Router action dispatched before initialization",
  "_next/static/chunks",
];

function isNextDevNoise(event: CaptureResult): boolean {
  const exceptions = event.properties?.["$exception_list"];
  if (!Array.isArray(exceptions)) return false;

  return exceptions.some((exception) => {
    const message = typeof exception?.value === "string" ? exception.value : "";
    const frames = exception?.stacktrace?.frames ?? [];
    const haystack = [
      message,
      ...frames.map((frame: { filename?: string }) => frame?.filename ?? ""),
    ].join("\n");

    return NEXT_HMR_NOISE.some((pattern) => haystack.includes(pattern));
  });
}

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  capture_exceptions: true,
  debug: process.env.NODE_ENV === "development",
  before_send: (event) => {
    if (event && event.event === "$exception") {
      // Drop every captured exception outside production: in dev, the only
      // autocaptured browser errors are framework/HMR noise from `next dev`.
      if (process.env.NODE_ENV !== "production") return null;
      // Backstop in case any Next.js HMR noise slips through in a prod-like build.
      if (isNextDevNoise(event)) return null;
    }
    return event;
  },
});
