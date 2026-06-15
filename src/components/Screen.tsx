import type { ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="bezel">
      <div className="screen" role="region" aria-label="terminal screen">
        <div className="canvas">
          <div className="canvas-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`row ${className}`}>{children}</div>;
}
