import { Badge } from "@/components/ui/badge";
import type { Case } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";

type Note = Case["notes"][number];

const eyebrow = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export function CaseNote({ note, id, action }: { note: Note; id?: string; action?: React.ReactNode }) {
  return (
    <li id={id} className="scroll-mt-18 space-y-2 rounded-md bg-muted p-3 text-sm transition-colors">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Note · {formatDate(note.createdAt)}
        {note.source === "AI_DRAFT_EDITED" && <Badge variant="info">AI draft, reviewed by rep</Badge>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {note.issue && (
        <div>
          <p className={eyebrow}>Issue</p>
          <p className="font-medium">{note.issue}</p>
        </div>
      )}
      <div>
        <p className={eyebrow}>Summary</p>
        <p>{note.summary}</p>
      </div>
      {note.nextSteps.length > 0 && (
        <div className="border-t border-foreground/10 pt-2">
          <p className={eyebrow}>Next steps</p>
          <ul className="list-disc pl-5">
            {note.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
