"use client";

import { flashElement } from "@/lib/flash-element";

const chipClass = "rounded-sm bg-muted px-1 font-mono text-xs";

// Answers only exist in the browser (they stream in after a question), so reading the DOM during
// render is safe here.
export function AgentReference({ label, targetId }: { label: string; targetId: string }) {
  const exists = typeof document !== "undefined" && document.getElementById(targetId) !== null;
  if (!exists) return <span className={chipClass}>{label}</span>;

  return (
    <a
      href={`#${targetId}`}
      className={`${chipClass} text-accent-foreground underline underline-offset-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        event.preventDefault();
        history.replaceState(null, "", `#${targetId}`);
        flashElement(target);
      }}
    >
      {label}
    </a>
  );
}
