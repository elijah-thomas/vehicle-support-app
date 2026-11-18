import { FaultReference, RecallReference } from "@/components/assistant/agent-reference";
import { toBlocks } from "@/lib/assistant/agent-answer-blocks";

// Fault codes (P0C73) and recall campaigns (MR-24-117) become links to their rows. Matched by
// pattern on the client, so no extra data reaches the panel. Cases are cited by subject and date, so
// they stay plain text. See docs/decisions.md#vehicle-status and docs/decisions.md#layout-freshness
const REFERENCE = /\b(?:[PBCU][0-9A-F]{4}|[A-Z]{2}-\d{2}-\d{3})\b/g;

function withReferences(text: string, vin: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(REFERENCE)) {
    const [ref] = match;
    nodes.push(text.slice(last, match.index));
    nodes.push(
      ref.includes("-") ? (
        <RecallReference key={match.index} label={ref} targetId={`recall-${ref}`} />
      ) : (
        <FaultReference key={match.index} vin={vin} code={ref} />
      ),
    );
    last = match.index + ref.length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

export function AgentAnswer({ vin, text }: { vin: string; text: string }) {
  return (
    <div className="space-y-2 text-sm leading-5">
      {toBlocks(text).map((block, i) => {
        if (block.kind === "paragraph") return <p key={i}>{withReferences(block.text, vin)}</p>;
        if (block.kind === "list") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>{withReferences(item, vin)}</li>
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
                  <li key={j}>{withReferences(item, vin)}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
