import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TelematicsEvent } from "@/lib/customer/vehicles";
import { formatDateTime, formatRelative, ordinal, telematicsReading } from "@/lib/format";
import { getTelematicsSnapshot, newestPerCode, occurrences } from "@/lib/telematics";

const severityDisplay = {
  CRITICAL: { variant: "destructive", Icon: OctagonAlert, label: "Critical" },
  WARN: { variant: "warning", Icon: TriangleAlert, label: "Warning" },
  INFO: { variant: "info", Icon: Info, label: "Info" },
} as const satisfies Record<TelematicsEvent["severity"], object>;

export async function TelematicsPanel({ vin }: { vin: string }) {
  const snapshot = await getTelematicsSnapshot(vin);
  if (!snapshot) return null;

  const { events, fetchedAt: now } = snapshot;
  const occurrence = occurrences(events);
  const anchors = newestPerCode(events);

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
          <ul className="space-y-1">
            {events.map((event) => {
              const { variant, Icon, label } = severityDisplay[event.severity];
              const count = occurrence.get(event.id) ?? 1;
              const reading = telematicsReading(event.message, event.value);
              const meta = [
                reading.value,
                count > 1 && `${ordinal(count)} time`,
              ].filter(Boolean);
              return (
                <li
                  key={event.id}
                  id={event.code && anchors.has(event.id) ? `dtc-${event.code}` : undefined}
                  className="grid scroll-mt-18 grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-1 py-1.5 text-sm transition-colors"
                >
                  <Badge variant={variant} className="justify-self-start">
                    <Icon data-icon="inline-start" aria-hidden />
                    {label}
                  </Badge>
                  <div className="min-w-0">
                    <p>
                      {event.code && <span className="mr-1.5 font-mono font-medium">{event.code}</span>}
                      {reading.label}
                    </p>
                    {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>}
                  </div>
                  <time
                    dateTime={event.recordedAt}
                    title={formatDateTime(event.recordedAt)}
                    className="text-right text-xs whitespace-nowrap text-muted-foreground"
                  >
                    {formatRelative(event.recordedAt, now)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
