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

// Collapsed lists (ExpandableList) listen for this and expand when they hold the row asked for.
export const REVEAL_EVENT = "record:reveal";

// Long enough for a collapsed list to hear the reveal and render the row.
const FALLBACK_GRACE_MS = 250;

// A saved note reaches the page with the action's refreshed render, which can commit a frame or two
// after the action resolves, so wait for it briefly. A row in a collapsed list appears once the list
// expands, so the same wait covers it.
// With `fallbackId` (the panel that would hold the row), the panel is flashed instead once it has
// shown for a moment without the row. The reveal is re-sent each frame, because a panel that mounts
// after a navigation registers its listener after the first one was sent.
export function flashWhenPresent(id: string, { timeoutMs = 3000, fallbackId }: { timeoutMs?: number; fallbackId?: string } = {}) {
  const start = performance.now();
  let fallbackSince: number | null = null;
  function attempt() {
    const target = document.getElementById(id);
    if (target) return flashElement(target);
    window.dispatchEvent(new CustomEvent<string>(REVEAL_EVENT, { detail: id }));
    const now = performance.now();
    const fallback = fallbackId ? document.getElementById(fallbackId) : null;
    if (fallback) {
      fallbackSince ??= now;
      if (now - fallbackSince > FALLBACK_GRACE_MS) return flashElement(fallback);
    }
    if (now - start < timeoutMs) requestAnimationFrame(attempt);
    else if (fallback) flashElement(fallback);
  }
  attempt();
}
