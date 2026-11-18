import Link from "next/link";
import { ExpandableList } from "@/components/shared/expandable-list";
import { SeverityBadge } from "@/components/vehicle/severity-badge";
import { Badge } from "@/components/ui/badge";
import { caseHref, faultWindow, matchFaultsToCases } from "@/lib/cases";
import { getTelematicsSnapshot } from "@/lib/customer/snapshots";
import { getFaultsInWindow } from "@/lib/customer/cached-reads";
import type { Case, TelematicsEvent } from "@/lib/customer/reads";
import { formatCaseNumber, formatDate, ordinal } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

const NEWEST_SHOWN = 3;

// Every time the fault this case is matched to (D11) was logged, newest first, with the case each
// occurrence led to. Renders nothing when the case has no matched fault, or telematics is down.
export async function FaultHistory({ vin, supportCase, cases }: { vin: string; supportCase: Case; cases: Case[] }) {
  const loaded = await loadPanel("fault history", () => loadFaults(vin, cases));
  if (!loaded.ok) return null;
  const { faultForCase, caseForEvent } = matchFaultsToCases(cases, loaded.data);
  const fault = faultForCase.get(supportCase.id);
  if (!fault?.code) return null;

  const occurrences = loaded.data
    .filter((event) => event.code === fault.code)
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const oldest = occurrences.at(-1)!;
  const ledTo = new Map(occurrences.flatMap((event) => (caseForEvent.has(event.id) ? [[event.id, caseForEvent.get(event.id)!]] : [])));
  const repairs = new Set([...ledTo.values()].filter((c) => c.status === "CLOSED" && c.resolution).map((c) => c.id)).size;

  const summary = [
    occurrences.length === 1 ? `Once, on ${formatDate(oldest.recordedAt)}` : `${occurrences.length} times since ${formatDate(oldest.recordedAt)}`,
    repairs > 0 && (repairs === 1 ? "1 repair tried" : `${repairs} repairs tried`),
  ].filter(Boolean);

  return (
    <section data-fault-history aria-labelledby="fault-history-title" className="space-y-3">
      <div>
        <h3 id="fault-history-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Fault history · <span className="font-mono">{fault.code}</span>
        </h3>
        <p className="mt-1 text-sm font-medium">{oldest.message}</p>
        <p className="text-xs text-muted-foreground">{summary.join(" · ")}</p>
      </div>
      <ExpandableList
        className="space-y-3"
        initial={NEWEST_SHOWN}
        noun={["earlier", "earlier"]}
        items={occurrences.map((event, index) => {
          const nth = occurrences.length - index;
          const led = ledTo.get(event.id);
          return {
            key: event.id,
            node: (
              <div className="space-y-1.5 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap">{formatDate(event.recordedAt)}</span>
                  <SeverityBadge severity={event.severity} />
                  <span className="text-xs text-muted-foreground">{nth === 1 ? "First time" : `${ordinal(nth)} time`}</span>
                </p>
                {led && <LedToCase vin={vin} supportCase={led} current={led.id === supportCase.id} />}
              </div>
            ),
          };
        })}
      />
    </section>
  );
}

function LedToCase({ vin, supportCase, current }: { vin: string; supportCase: Case; current: boolean }) {
  const isOpen = supportCase.status === "OPEN";
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant={isOpen ? "info" : "secondary"}>{isOpen ? "Open" : "Closed"}</Badge>
        <span className="font-mono text-[13px] whitespace-nowrap">{formatCaseNumber(supportCase.number)}</span>
        {current && <span className="text-xs font-semibold text-info">This case</span>}
      </span>
      <span className="block font-medium">{supportCase.subject}</span>
      <span className="block text-xs text-muted-foreground">
        {supportCase.closedAt
          ? [`Closed ${formatDate(supportCase.closedAt)}`, supportCase.resolution].filter(Boolean).join(" · ")
          : `Opened ${formatDate(supportCase.openedAt)}`}
      </span>
    </>
  );
  const box = "ml-4 block space-y-0.5 rounded-md border px-3 py-2";
  // The case in view is tinted and named, not linked to itself.
  if (current) return <div className={`${box} border-info/40 bg-info-soft`}>{body}</div>;
  return (
    <Link
      href={caseHref(vin, supportCase.number)}
      className={`${box} transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      {body}
    </Link>
  );
}

// Each case's week before it opened (cached once settled, D7), plus the live feed for faults that
// haven't led to a case yet. Windows overlap when cases open close together, so events are
// de-duplicated by ID.
async function loadFaults(vin: string, cases: Case[]) {
  const [windows, live] = await Promise.all([
    Promise.all(
      cases.map((c) => {
        const { from, to } = faultWindow(c);
        return getFaultsInWindow(vin, from, to);
      }),
    ),
    // The live feed only adds faults that haven't led to a case yet; the windows are enough without it.
    getTelematicsSnapshot(vin).catch(() => null),
  ]);
  const byId = new Map<string, TelematicsEvent>();
  for (const event of [...windows.flat(), ...(live?.events ?? [])]) if (event?.code) byId.set(event.id, event);
  return [...byId.values()];
}
