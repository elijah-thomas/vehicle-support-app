import { ChevronRight, FilePlus } from "lucide-react";
import Link from "next/link";
import { ExpandableList } from "@/components/expandable-list";
import { PanelUnavailable } from "@/components/panel-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCaseSnapshot } from "@/lib/case-snapshot";
import { caseHref, lastContact, matchFaultsToCases, newCaseHref, sortCases } from "@/lib/cases";
import type { Case } from "@/lib/customer/vehicles";
import { formatCaseNumber, formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";
import { getTelematicsSnapshot } from "@/lib/telematics";

const NEWEST_CLOSED_SHOWN = 3;

function dates(supportCase: Case) {
  return supportCase.closedAt
    ? `${formatDate(supportCase.openedAt)} to ${formatDate(supportCase.closedAt)}`
    : `opened ${formatDate(supportCase.openedAt)}`;
}

export async function CaseHistory({ vin }: { vin: string }) {
  const loaded = await loadPanel("cases", () => getCaseSnapshot(vin));
  if (!loaded.ok) return <PanelUnavailable title="Case history" id="cases" />;
  if (!loaded.data) return null;
  const cases = sortCases(loaded.data.cases);
  const open = cases.filter((c) => c.status === "OPEN").length;

  // Telematics only adds each case's fault code; without it the rows still show.
  const telematics = await loadPanel("cases telematics", () => getTelematicsSnapshot(vin));
  const { faultForCase } = matchFaultsToCases(cases, telematics.ok ? (telematics.data?.events ?? []) : []);

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
          // Open cases always show; then the newest closed ones, and the rest on request.
          <ExpandableList
            className="space-y-2"
            initial={open + NEWEST_CLOSED_SHOWN}
            noun={["older case", "older cases"]}
            items={cases.map((supportCase) => {
              const isOpen = supportCase.status === "OPEN";
              const notes = supportCase.notes.length;
              const code = faultForCase.get(supportCase.id)?.code;
              return {
                key: supportCase.id,
                node: (
                  <Link
                    href={caseHref(vin, supportCase.number)}
                    className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isOpen ? "info" : "secondary"}>{isOpen ? "Open" : "Closed"}</Badge>
                        <span className="font-mono text-[13px] whitespace-nowrap text-muted-foreground">
                          {formatCaseNumber(supportCase.number)}
                        </span>
                      </div>
                      <p className="font-medium">{supportCase.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {[supportCase.category, dates(supportCase)].join(" · ")}
                        {code && (
                          <>
                            {" · "}
                            <span className="font-mono">{code}</span>
                          </>
                        )}
                      </p>
                      {isOpen && (
                        <p className="text-xs text-muted-foreground">
                          Last contact {formatDate(lastContact(supportCase))} · {notes === 1 ? "1 note" : `${notes} notes`}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ),
              };
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}
