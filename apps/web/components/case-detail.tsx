import { CircleCheck, Clock, FilePlus } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaseNote } from "@/components/case-note";
import { CaseNoteForm } from "@/components/case-note-form";
import { CloseCaseForm } from "@/components/close-case-form";
import { PanelUnavailable } from "@/components/panel-unavailable";
import { RelatedFaults } from "@/components/related-faults";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { contactStatus, OVERDUE_AFTER_BUSINESS_DAYS } from "@/lib/cases";
import { getCaseSnapshot } from "@/lib/case-snapshot";
import type { Case } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

// One case, read from the vehicle's cached case list (no per-case endpoint or cache tag).
// See docs/decisions.md#case-view
export async function CaseDetail({ vin, caseId }: { vin: string; caseId: string }) {
  const loaded = await loadPanel("case", () => getCaseSnapshot(vin));
  if (!loaded.ok) return <PanelUnavailable title="This case" />;
  const cases = loaded.data?.cases ?? [];
  const supportCase = cases.find((c) => c.id === caseId);
  if (!supportCase || !loaded.data) notFound();

  const contact = contactStatus(supportCase, loaded.data.now);
  const isOpen = supportCase.status === "OPEN";

  return (
    <Card className="gap-0 py-0">
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isOpen ? "info" : "secondary"}>{isOpen ? "Open" : "Closed"}</Badge>
              {contact.overdue && <Badge variant="warning">Overdue</Badge>}
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{supportCase.subject}</h1>
          </div>
          {isOpen && <CloseCaseForm vin={vin} caseId={supportCase.id} />}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Field label="Category" value={supportCase.category} />
          <Field label="Opened" value={formatDate(supportCase.openedAt)} />
          {supportCase.closedAt ? (
            <Field label="Closed" value={formatDate(supportCase.closedAt)} />
          ) : (
            <Field label="Last contact" value={formatDate(contact.lastContact)} />
          )}
        </dl>

        {contact.overdue && (
          <p role="note" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
            <Clock className="size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-semibold">No contact in {contact.daysWithoutContact} business days.</span> Open cases
              are overdue after {OVERDUE_AFTER_BUSINESS_DAYS}. Last contact {formatDate(contact.lastContact)}.
            </span>
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6 p-4 lg:border-r">
          {isOpen && <CaseNoteForm vin={vin} caseId={supportCase.id} />}
          <Activity supportCase={supportCase} />
        </div>
        <div className="border-t p-4 lg:border-t-0">
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <RelatedFaults vin={vin} supportCase={supportCase} cases={cases} />
          </Suspense>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

// Newest first: closing, then each note, then the case being opened.
function Activity({ supportCase }: { supportCase: Case }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Activity</h2>
      <ol className="space-y-3">
        {supportCase.closedAt && (
          <Event Icon={CircleCheck} title="Case closed" date={supportCase.closedAt}>
            {supportCase.resolution}
          </Event>
        )}
        {supportCase.notes.map((note) => (
          <CaseNote key={note.id} note={note} id={`note-${note.id}`} />
        ))}
        <Event Icon={FilePlus} title="Case opened" date={supportCase.openedAt}>
          {supportCase.description}
        </Event>
      </ol>
    </section>
  );
}

function Event({
  Icon,
  title,
  date,
  children,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3" aria-hidden />
      </span>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{title}</span> · {formatDate(date)}
        </p>
        <p>{children}</p>
      </div>
    </li>
  );
}
