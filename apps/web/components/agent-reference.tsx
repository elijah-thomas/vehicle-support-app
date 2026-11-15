"use client";

const HIGHLIGHT_MS = 1500;
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
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        history.replaceState(null, "", `#${targetId}`);
        if (reduceMotion) return;
        target.setAttribute("data-highlight", "");
        window.setTimeout(() => target.removeAttribute("data-highlight"), HIGHLIGHT_MS);
      }}
    >
      {label}
    </a>
  );
}
