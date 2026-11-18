import Link from "next/link";
import { ExpandableList } from "@/components/shared/expandable-list";
import { PanelUnavailable } from "@/components/shared/panel-unavailable";
import { SeverityBadge } from "@/components/vehicle/severity-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCaseSnapshot, getTelematicsSnapshot } from "@/lib/customer/snapshots";
import { caseHref, daysBetween, matchFaultsToCases } from "@/lib/cases";
import { formatCaseNumber, formatDateTime, formatRelative, ordinal, telematicsReading } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";
import { newestPerCode, occurrences } from "@/lib/telematics";

const NEWEST_SHOWN = 10;

function laterLabel(days: number) {
  if (days === 0) return "opened the same day";
  return `opened ${days === 1 ? "1 day" : `${days} days`} later`;
}

export async function TelematicsPanel({ vin }: { vin: string }) {
  const loaded = await loadPanel("telematics", () => getTelematicsSnapshot(vin));
  if (!loaded.ok) return <PanelUnavailable title="Telematics" id="telematics" />;
  const snapshot = loaded.data;
  if (!snapshot) return null;

  const { events, fetchedAt: now } = snapshot;
  const occurrence = occurrences(events);
  const anchors = newestPerCode(events);
  // Cases are only for linking a fault to the case it led to; without them the rows still show.
  const cases = await loadPanel("telematics cases", () => getCaseSnapshot(vin));
  const { caseForEvent } = matchFaultsToCases(cases.ok ? (cases.data?.cases ?? []) : [], events);

  return (
    <Card id="telematics" className="scroll-mt-18">
      <CardHeader>
        <CardTitle>Telematics</CardTitle>
        <CardDescription>Live from the vehicle data service, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No telematics received yet.</p>
        ) : (
          <ExpandableList
            className="space-y-1"
            initial={NEWEST_SHOWN}
            noun={["older event", "older events"]}
            items={events.map((event) => {
              const count = occurrence.get(event.id) ?? 1;
              const reading = telematicsReading(event.message, event.value);
              const ledTo = caseForEvent.get(event.id);
              const meta = [reading.value, count > 1 && `${ordinal(count)} time`].filter(Boolean);
              const anchor = event.code && anchors.has(event.id) ? `dtc-${event.code}` : undefined;
              return {
                key: event.id,
                ids: anchor ? [anchor] : [],
                node: (
                  <div
                    id={anchor}
                    className="grid scroll-mt-18 grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-1 py-1.5 text-sm transition-colors"
                  >
                    <SeverityBadge severity={event.severity} className="justify-self-start" />
                    <div className="min-w-0">
                      <p>
                        {event.code && <span className="mr-1.5 font-mono font-medium">{event.code}</span>}
                        {reading.label}
                      </p>
                      {(meta.length > 0 || ledTo) && (
                        <p className="text-xs text-muted-foreground">
                          {meta.join(" · ")}
                          {meta.length > 0 && ledTo && " · "}
                          {ledTo && (
                            <>
                              <Link
                                href={caseHref(vin, ledTo.number)}
                                className="font-mono whitespace-nowrap text-primary underline-offset-4 hover:underline"
                              >
                                {formatCaseNumber(ledTo.number)}
                              </Link>{" "}
                              {laterLabel(daysBetween(event.recordedAt, ledTo.openedAt))}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <time
                      dateTime={event.recordedAt}
                      title={formatDateTime(event.recordedAt)}
                      className="text-right text-xs whitespace-nowrap text-muted-foreground"
                    >
                      {formatRelative(event.recordedAt, now)}
                    </time>
                  </div>
                ),
              };
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}
