import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TelematicsEvent } from "@/lib/customer/vehicles";

const severityDisplay = {
  CRITICAL: { variant: "destructive", Icon: OctagonAlert, label: "Critical" },
  WARN: { variant: "warning", Icon: TriangleAlert, label: "Warning" },
  INFO: { variant: "info", Icon: Info, label: "Info" },
} as const satisfies Record<TelematicsEvent["severity"], object>;

// The telematics severity badge, wherever an event appears (the overview, a case's fault history).
export function SeverityBadge({ severity, className }: { severity: TelematicsEvent["severity"]; className?: string }) {
  const { variant, Icon, label } = severityDisplay[severity];
  return (
    <Badge variant={variant} className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {label}
    </Badge>
  );
}
