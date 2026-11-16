const HIGHLIGHT_MS = 1500;

// Scrolls a record row into view and briefly highlights it (styled by [data-highlight] in globals.css).
export function flashElement(target: HTMLElement) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  if (reduceMotion) return;
  target.setAttribute("data-highlight", "");
  window.setTimeout(() => target.removeAttribute("data-highlight"), HIGHLIGHT_MS);
}

// A saved note reaches the page with the action's refreshed render, which can commit a frame or two
// after the action resolves, so wait for it briefly.
export function flashWhenPresent(id: string, timeoutMs = 3000) {
  const start = performance.now();
  function attempt() {
    const target = document.getElementById(id);
    if (target) return flashElement(target);
    if (performance.now() - start < timeoutMs) requestAnimationFrame(attempt);
  }
  attempt();
}
