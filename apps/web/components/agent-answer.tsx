import { AgentReference } from "@/components/agent-reference";

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

// Fault codes (P0C73) and recall campaigns (MR-24-117) become links to their rows on the page.
// Matched by pattern on the client, so no extra data reaches the panel. Cases are cited by subject
// and date, so they stay plain text. See docs/decisions.md#vehicle-status
const REFERENCE = /\b(?:[PBCU][0-9A-F]{4}|[A-Z]{2}-\d{2}-\d{3})\b/g;

function withReferences(text: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(REFERENCE)) {
    const [ref] = match;
    nodes.push(text.slice(last, match.index));
    const targetId = ref.includes("-") ? `recall-${ref}` : `dtc-${ref}`;
    nodes.push(<AgentReference key={match.index} label={ref} targetId={targetId} />);
    last = match.index + ref.length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

export function AgentAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-5">
      {toBlocks(text).map((block, i) => {
        if (block.kind === "paragraph") return <p key={i}>{withReferences(block.text)}</p>;
        if (block.kind === "list") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>{withReferences(item)}</li>
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
                  <li key={j}>{withReferences(item)}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
