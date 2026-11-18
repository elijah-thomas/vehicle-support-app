import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type ActivityItem, CaseActivity } from "@/components/case-activity";
import { CaseNoteForm } from "@/components/case-note-form";
import { CaseStatusAction } from "@/components/case-status-action";
import { FaultHistory } from "@/components/fault-history";
import { PanelUnavailable } from "@/components/panel-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCaseSnapshot } from "@/lib/customer/snapshots";
import { isReopenNote, lastContact, newestFirst } from "@/lib/cases";
import type { Case } from "@/lib/customer/reads";
import { formatCaseNumber, formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

// Decision (D41): one case, read from the vehicle's cached case list, which every write clears. The
// fault history needs the whole list anyway, so a per-case read would add a call and a cache entry
// for nothing yet. See docs/decisions.md#vehicle-routes
export async function CaseDetail({ vin, number }: { vin: string; number: number }) {
  const loaded = await loadPanel("case", () => getCaseSnapshot(vin));
  if (!loaded.ok) return <PanelUnavailable title="This case" />;
  const cases = loaded.data?.cases ?? [];
  const supportCase = cases.find((c) => c.number === number);
  if (!supportCase) notFound();

  const isOpen = supportCase.status === "OPEN";
  const notes = supportCase.notes.filter((note) => !isReopenNote(note)).length;

  return (
    <Card className="gap-0 py-0">
      <div className="border-b p-4">
        <CaseStatusAction vin={vin} caseId={supportCase.id} isOpen={isOpen}>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] whitespace-nowrap text-muted-foreground">
                {formatCaseNumber(supportCase.number)}
              </span>
              <Badge variant={isOpen ? "info" : "secondary"}>{isOpen ? "Open" : "Closed"}</Badge>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{supportCase.subject}</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Field label="Category" value={supportCase.category} />
            <Field label="Opened" value={formatDate(supportCase.openedAt)} />
            {supportCase.closedAt && <Field label="Closed" value={formatDate(supportCase.closedAt)} />}
            <Field label="Last contact" value={formatDate(lastContact(supportCase))} />
            <Field label="Notes" value={String(notes)} />
          </dl>
        </CaseStatusAction>
      </div>

      {/* Two columns only when the case has a fault history to show beside its activity. */}
      <div className="grid lg:has-[[data-fault-history]]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6 p-4">
          {isOpen && <CaseNoteForm vin={vin} caseId={supportCase.id} />}
          <CaseActivity vin={vin} caseId={supportCase.id} items={activity(supportCase)} />
        </div>
        <div
          id="fault-history"
          className="scroll-mt-18 border-t p-4 transition-colors empty:hidden lg:border-t-0 lg:border-l"
        >
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <FaultHistory vin={vin} supportCase={supportCase} cases={cases} />
          </Suspense>
        </div>
      </div>
    </Card>
  );
}

// Newest first: notes, the opening, a close, and any reopen (kept as a rep note by the API, D40).
function activity(supportCase: Case): ActivityItem[] {
  const items: ActivityItem[] = supportCase.notes.map((note) =>
    isReopenNote(note)
      ? { kind: "reopened", date: note.createdAt, text: note.summary }
      : { kind: "note", date: note.createdAt, note },
  );
  items.push({ kind: "opened", date: supportCase.openedAt, text: supportCase.description });
  if (supportCase.closedAt) items.push({ kind: "closed", date: supportCase.closedAt, text: supportCase.resolution ?? "" });
  return items.sort(newestFirst);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
