import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { caseHref, earlierCasesWithSameFault, RELATED_FAULT_WINDOW_DAYS, relatedFaults } from "@/lib/cases";
import { type Case, getTelematics } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

const severityDisplay = {
  CRITICAL: { variant: "destructive", label: "Critical" },
  WARN: { variant: "warning", label: "Warning" },
  INFO: { variant: "info", label: "Info" },
} as const;

// Cases have no link to telematics in the customer's system, so faults are matched by code and
// date, and the panel says so. See docs/decisions.md#case-view
export async function RelatedFaults({ vin, supportCase, cases }: { vin: string; supportCase: Case; cases: Case[] }) {
  const loaded = await loadPanel("related faults", () => getTelematics(vin));
  if (!loaded.ok) {
    return <p className="text-sm text-muted-foreground">Telematics couldn&apos;t be loaded, so related faults aren&apos;t shown.</p>;
  }
  const events = loaded.data ?? [];
  const faults = relatedFaults(supportCase, events);
  const earlier = earlierCasesWithSameFault(supportCase, cases, events);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Related faults</h2>
        {faults.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fault codes in the {RELATED_FAULT_WINDOW_DAYS} days before this case opened.</p>
        ) : (
          <ul className="space-y-1.5">
            {faults.map((fault) => {
              const { variant, label } = severityDisplay[fault.severity];
              const total = events.filter((event) => event.code === fault.code).length;
              return (
                <li key={fault.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variant}>{label}</Badge>
                    <span className="font-mono font-medium">{fault.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(fault.recordedAt)}
                      {total > 1 && ` · ${total} times on this vehicle`}
                    </span>
                  </div>
                  <p>{fault.message}</p>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Matched by date: fault codes logged in the {RELATED_FAULT_WINDOW_DAYS} days before the case opened.
        </p>
      </section>

      {earlier.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Earlier cases, same fault</h2>
          <ul className="space-y-1.5">
            {earlier.map((other) => (
              <li key={other.id}>
                <Link
                  href={caseHref(vin, other.id)}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{other.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {other.closedAt ? `Closed ${formatDate(other.closedAt)}` : `Opened ${formatDate(other.openedAt)}`}
                      {other.resolution && ` · ${other.resolution}`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
