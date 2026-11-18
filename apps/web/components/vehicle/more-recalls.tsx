import { ShieldAlert } from "lucide-react";
import { PeekButton } from "@/components/shared/peek-button";
import { RecordLink } from "@/components/shared/record-link";

// The open recalls past the first two chips. Each one scrolls to its banner in the header.
export function MoreRecalls({ campaigns }: { campaigns: string[] }) {
  return (
    <PeekButton
      label={`+${campaigns.length} ${campaigns.length === 1 ? "recall" : "recalls"}`}
      title={`More open recalls · ${campaigns.length}`}
      className="h-7"
    >
      <ul className="space-y-0.5">
        {campaigns.map((campaign) => (
          <li key={campaign}>
            <RecordLink
              targetId={`recall-${campaign}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ShieldAlert className="size-3.5 text-warning" aria-hidden />
              <span className="font-mono">{campaign}</span>
            </RecordLink>
          </li>
        ))}
      </ul>
    </PeekButton>
  );
}
