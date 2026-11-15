import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTelematics, type TelematicsEvent } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";

const severityVariant = {
  CRITICAL: "destructive",
  WARN: "outline",
  INFO: "secondary",
} as const satisfies Record<TelematicsEvent["severity"], string>;

export async function TelematicsPanel({ vin }: { vin: string }) {
  const events = await getTelematics(vin, 20);
  if (!events) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telematics</CardTitle>
        <CardDescription>Live from the vehicle data service, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No telematics received yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 text-sm">
                <Badge variant={severityVariant[event.severity]} className="w-20 justify-center">
                  {event.severity}
                </Badge>
                <div className="min-w-0">
                  <p>
                    {event.code && <span className="mr-1 font-mono font-medium">{event.code}</span>}
                    {event.message}
                    {event.value !== null && <span className="text-muted-foreground"> · {event.value}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(event.recordedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
