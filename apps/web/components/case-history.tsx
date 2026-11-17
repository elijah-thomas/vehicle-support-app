import { ChevronRight, Clock, FilePlus } from "lucide-react";
import Link from "next/link";
import { PanelUnavailable } from "@/components/panel-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCaseSnapshot } from "@/lib/case-snapshot";
import { caseHref, contactStatus, newCaseHref, sortCases } from "@/lib/cases";
import { formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

export async function CaseHistory({ vin }: { vin: string }) {
  const loaded = await loadPanel("cases", () => getCaseSnapshot(vin));
  if (!loaded.ok) return <PanelUnavailable title="Case history" id="cases" />;
  if (!loaded.data) return null;
  const { now } = loaded.data;
  const cases = sortCases(loaded.data.cases);
  const open = cases.filter((c) => c.status === "OPEN").length;

  return (
    <Card id="cases" className="scroll-mt-18">
      <CardHeader>
        <CardTitle>Case history</CardTitle>
        <CardDescription>
          {cases.length === 0 ? "No cases" : `${open} open, ${cases.length - open} closed`}. Open first, then newest.
        </CardDescription>
        <CardAction>
          <Link href={newCaseHref(vin)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FilePlus aria-hidden />
            New case
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous cases for this vehicle.</p>
        ) : (
          <ul className="space-y-2">
            {cases.map((supportCase) => {
              const contact = contactStatus(supportCase, now);
              const isOpen = supportCase.status === "OPEN";
              const notes = supportCase.notes.length;
              return (
                <li key={supportCase.id}>
                  <Link
                    href={caseHref(vin, supportCase.number)}
                    className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isOpen ? "info" : "secondary"}>{isOpen ? "Open" : "Closed"}</Badge>
                        {contact.overdue && <Badge variant="warning">Overdue</Badge>}
                        <span className="font-medium">{supportCase.subject}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {supportCase.category} ·{" "}
                        {supportCase.closedAt
                          ? `${formatDate(supportCase.openedAt)} to ${formatDate(supportCase.closedAt)}`
                          : `opened ${formatDate(supportCase.openedAt)}`}
                        {" · "}
                        {notes === 1 ? "1 note" : `${notes} notes`}
                      </p>
                      {contact.overdue ? (
                        <p className="flex items-center gap-1 text-xs text-warning">
                          <Clock className="size-3" aria-hidden />
                          No contact in {contact.daysWithoutContact} business days
                        </p>
                      ) : (
                        supportCase.resolution && <p className="text-xs">{supportCase.resolution}</p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
