type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "next-steps"; items: string[] };

// The agent answers in plain text: a summary line, "- " bullets, then "Next steps:" with more
// bullets. Parsing runs on every streamed chunk, so a half-written answer renders the same way.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let inNextSteps = false;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const nextSteps = /^next steps:?\s*(.*)$/i.exec(line);
    if (nextSteps) {
      inNextSteps = true;
      blocks.push({ kind: "next-steps", items: nextSteps[1] ? [nextSteps[1]] : [] });
      continue;
    }

    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (inNextSteps && last?.kind === "next-steps") {
      last.items.push(bullet ? bullet[1] : line);
    } else if (bullet) {
      if (last?.kind === "list") last.items.push(bullet[1]);
      else blocks.push({ kind: "list", items: [bullet[1]] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

export function AgentAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-5">
      {toBlocks(text).map((block, i) => {
        if (block.kind === "paragraph") return <p key={i}>{block.text}</p>;
        if (block.kind === "list") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <section key={i} className="rounded-md bg-muted px-3 py-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next steps</h3>
            {block.items.length > 0 && (
              <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-muted-foreground">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
