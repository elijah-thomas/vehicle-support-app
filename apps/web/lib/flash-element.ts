const HIGHLIGHT_MS = 1500;

// Brings a record row into view (only if it isn't fully visible already) and briefly highlights it
// (styled by [data-highlight] in globals.css).
export function flashElement(target: HTMLElement) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { top, bottom, height } = target.getBoundingClientRect();
  const topBar = parseFloat(getComputedStyle(target).scrollMarginTop || "0");
  if (top < topBar || bottom > window.innerHeight) {
    // A panel taller than the screen lines up its heading under the top bar instead of centering.
    const tall = height > window.innerHeight - topBar;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: tall ? "start" : "center" });
  }
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
