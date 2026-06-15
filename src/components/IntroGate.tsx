"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BootSequence } from "./BootSequence";

export function IntroGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<"boot" | "done">("boot");

  useEffect(() => {
    let booted = false;
    try {
      booted = sessionStorage.getItem("mf:booted") === "1";
    } catch {
      /* private mode */
    }
    if (booted) setStage("done");
  }, []);

  if (stage === "boot") {
    return <BootSequence onDone={() => setStage("done")} />;
  }
  return <>{children}</>;
}
