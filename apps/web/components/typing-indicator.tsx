// Shown between "Reading the record…" and the first word of the answer, while the model works.
// relative: keeps the sr-only label inside the scrolling log. Without it, the label is positioned
// against the page and, once the log has scrolled, stretches the page's height.
export function TypingIndicator() {
  return (
    <div className="relative flex w-fit items-center gap-1 rounded-md bg-muted px-3 py-2.5" role="status">
      <span className="sr-only">Writing an answer…</span>
      {["[animation-delay:-0.3s]", "[animation-delay:-0.15s]", ""].map((delay) => (
        <span
          key={delay}
          className={`size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none ${delay}`}
          aria-hidden
        />
      ))}
    </div>
  );
}
