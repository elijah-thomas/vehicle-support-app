import { Check, FileText, OctagonAlert, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { RecordLink } from "@/components/record-link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { getCases } from "@/lib/customer/vehicles";
import { formatDateTime, formatRelative, ordinal } from "@/lib/format";
import { getTelematicsSnapshot, RECENT_WINDOW_DAYS, repeatKey, worstRecentEvent } from "@/lib/telematics";

// Worst first: critical event, open recalls, warning event, open cases. Telematics and cases stream
// in on their own, so flex `order` keeps that sequence whichever arrives first.
// See docs/decisions.md#vehicle-status
const ORDER = { critical: "order-1", recall: "order-2", warning: "order-3", cases: "order-4" } as const;

const tones = {
  destructive: { bg: "bg-destructive-soft", text: "text-destructive" },
  warning: { bg: "bg-warning-soft", text: "text-warning" },
  info: { bg: "bg-info-soft", text: "text-info" },
  success: { bg: "bg-success-soft", text: "text-success" },
  muted: { bg: "bg-muted", text: "text-muted-foreground" },
};

export function VehicleStatus({ vin, openRecallCampaigns }: { vin: string; openRecallCampaigns: string[] }) {
  return (
    <ul aria-label="Vehicle status" className="flex flex-wrap gap-2">
      <Suspense fallback={<ItemSkeleton className={ORDER.critical} />}>
        <TelematicsStatus vin={vin} />
      </Suspense>
      {openRecallCampaigns.map((campaign) => (
        <StatusItem
          key={campaign}
          className={ORDER.recall}
          targetId={`recall-${campaign}`}
          tone="warning"
          Icon={ShieldAlert}
          label="Open recall"
          detail={<span className="font-mono">{campaign}</span>}
        />
      ))}
      <Suspense fallback={<ItemSkeleton className={ORDER.cases} />}>
        <CasesStatus vin={vin} hasOpenRecalls={openRecallCampaigns.length > 0} />
      </Suspense>
    </ul>
  );
}

async function TelematicsStatus({ vin }: { vin: string }) {
  const snapshot = await getTelematicsSnapshot(vin);
  if (!snapshot) return null;

  const { events, fetchedAt: now } = snapshot;
  const worst = worstRecentEvent(events, now);
  if (!worst) {
    return (
      <StatusItem
        className={ORDER.critical}
        tone="success"
        Icon={Check}
        label="No recent faults"
        caption={`last ${RECENT_WINDOW_DAYS} days`}
      />
    );
  }

  const critical = worst.severity === "CRITICAL";
  const count = events.filter((event) => repeatKey(event) === repeatKey(worst)).length;
  return (
    <StatusItem
      className={critical ? ORDER.critical : ORDER.warning}
      targetId={worst.code ? `dtc-${worst.code}` : "telematics"}
      tone={critical ? "destructive" : "warning"}
      Icon={critical ? OctagonAlert : TriangleAlert}
      label={critical ? "Critical" : "Warning"}
      detail={worst.code ? <span className="font-mono">{worst.code}</span> : worst.message}
      caption={
        <>
          <time dateTime={worst.recordedAt} title={formatDateTime(worst.recordedAt)}>
            {formatRelative(worst.recordedAt, now)}
          </time>
          {count > 1 && ` · ${ordinal(count)} time`}
        </>
      }
    />
  );
}

async function CasesStatus({ vin, hasOpenRecalls }: { vin: string; hasOpenRecalls: boolean }) {
  const cases = await getCases(vin);
  if (!cases) return null;

  const open = cases.filter((supportCase) => supportCase.status === "OPEN").length;
  if (open === 0) {
    if (hasOpenRecalls) return null;
    return <StatusItem className={ORDER.cases} tone="muted" label="No open recalls or cases" plainLabel />;
  }
  return (
    <StatusItem
      className={ORDER.cases}
      targetId="cases"
      tone="info"
      Icon={FileText}
      label={open === 1 ? "1 open case" : `${open} open cases`}
    />
  );
}

function StatusItem({
  className,
  targetId,
  tone,
  Icon,
  label,
  plainLabel = false,
  detail,
  caption,
}: {
  className: string;
  targetId?: string;
  tone: keyof typeof tones;
  Icon?: LucideIcon;
  label: string;
  plainLabel?: boolean;
  detail?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  const { bg, text } = tones[tone];
  const content = (
    <>
      {Icon && <Icon className={cn("size-3.5 shrink-0", text)} aria-hidden />}
      <span className={plainLabel ? "text-muted-foreground" : cn("font-semibold", text)}>{label}</span>
      {detail && <span className="truncate">{detail}</span>}
      {caption && <span className="text-xs whitespace-nowrap text-muted-foreground">{caption}</span>}
    </>
  );
  const itemClass = cn("inline-flex h-7 max-w-full items-center gap-1.5 rounded-md pr-2 pl-1.5 text-[13px]", bg);

  return (
    <li className={cn("max-w-full", className)}>
      {targetId ? (
        <RecordLink
          targetId={targetId}
          className={cn(
            itemClass,
            "transition-shadow hover:ring-1 hover:ring-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {content}
        </RecordLink>
      ) : (
        <span className={itemClass}>{content}</span>
      )}
    </li>
  );
}

function ItemSkeleton({ className }: { className: string }) {
  return (
    <li className={className} aria-hidden>
      <Skeleton className="h-7 w-[120px] rounded-md" />
    </li>
  );
}
