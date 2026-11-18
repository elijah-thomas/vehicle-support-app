import { Check, ChevronRight, FileText, OctagonAlert, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { MoreRecalls } from "@/components/vehicle/more-recalls";
import { CurrentPageLink, PageAwareLink } from "@/components/vehicle/page-aware-link";
import { RecordLink } from "@/components/shared/record-link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { caseHref } from "@/lib/cases";
import { getCaseSnapshot, getTelematicsSnapshot } from "@/lib/customer/snapshots";
import { formatCaseNumber, formatDate, formatDateTime, formatRelative, ordinal } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";
import { RECENT_WINDOW_DAYS, repeatKey, worstRecentEvent } from "@/lib/telematics";

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

// More than two open recalls: the first two as chips, the rest behind a count.
const RECALL_CHIPS = 2;

export function VehicleStatus({ vin, openRecallCampaigns }: { vin: string; openRecallCampaigns: string[] }) {
  return (
    <ul aria-label="Vehicle status" className="flex flex-wrap gap-2">
      <Suspense fallback={<ItemSkeleton className={ORDER.critical} />}>
        <TelematicsStatus vin={vin} />
      </Suspense>
      {openRecallCampaigns.slice(0, RECALL_CHIPS).map((campaign) => (
        <StatusItem
          key={campaign}
          className={ORDER.recall}
          link={{ kind: "record", targetId: `recall-${campaign}` }}
          tone="warning"
          Icon={ShieldAlert}
          label="Open recall"
          detail={<span className="font-mono">{campaign}</span>}
        />
      ))}
      {openRecallCampaigns.length > RECALL_CHIPS && (
        <li className={ORDER.recall}>
          <MoreRecalls campaigns={openRecallCampaigns.slice(RECALL_CHIPS)} />
        </li>
      )}
      <Suspense fallback={<ItemSkeleton className={ORDER.cases} />}>
        <CasesStatus vin={vin} hasOpenRecalls={openRecallCampaigns.length > 0} />
      </Suspense>
    </ul>
  );
}

// A failed load shows nothing here: the panel below explains the failure and offers Retry.
async function TelematicsStatus({ vin }: { vin: string }) {
  const loaded = await loadPanel("telematics status", () => getTelematicsSnapshot(vin));
  const snapshot = loaded.ok ? loaded.data : null;
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
      // The fault's newest row on the overview; its fault history on a case page.
      link={{
        kind: "page",
        vin,
        overviewTarget: worst.code ? `dtc-${worst.code}` : "telematics",
        caseTarget: worst.code ? "fault-history" : undefined,
      }}
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
  const loaded = await loadPanel("cases status", () => getCaseSnapshot(vin));
  const snapshot = loaded.ok ? loaded.data : null;
  if (!snapshot) return null;
  const { cases } = snapshot;

  const open = cases.filter((supportCase) => supportCase.status === "OPEN");
  if (open.length === 0) {
    if (hasOpenRecalls) return null;
    return <StatusItem className={ORDER.cases} tone="muted" label="No open recalls or cases" plainLabel />;
  }
  if (open.length > 1) {
    return (
      <StatusItem
        className={ORDER.cases}
        link={{ kind: "page", vin, overviewTarget: "cases" }}
        tone="info"
        Icon={FileText}
        label={`${open.length} open cases`}
      />
    );
  }

  // One open case: the chip opens it.
  const [only] = open;
  return (
    <StatusItem
      className={ORDER.cases}
      link={{ kind: "case", href: caseHref(vin, only.number) }}
      tone="info"
      Icon={FileText}
      label="Open case"
      detail={<span className="font-mono whitespace-nowrap">{formatCaseNumber(only.number)}</span>}
      caption={`opened ${formatDate(only.openedAt)}`}
    />
  );
}

type ItemLink =
  | { kind: "record"; targetId: string }
  | { kind: "page"; vin: string; overviewTarget: string; caseTarget?: string }
  | { kind: "case"; href: string };

function StatusItem({
  className,
  link,
  tone,
  Icon,
  label,
  plainLabel = false,
  detail,
  caption,
}: {
  className: string;
  link?: ItemLink;
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
  const linkClass = cn(
    itemClass,
    "transition-shadow hover:ring-1 hover:ring-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  );

  return (
    <li className={cn("max-w-full", className)}>
      {link?.kind === "case" ? (
        // On the case's own page this chip is the current item: a stronger border and no chevron.
        <CurrentPageLink
          href={link.href}
          className={linkClass}
          currentClassName={cn(itemClass, "ring-1 ring-info/60")}
          trailing={<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        >
          {content}
        </CurrentPageLink>
      ) : link?.kind === "page" ? (
        <PageAwareLink vin={link.vin} overviewTarget={link.overviewTarget} caseTarget={link.caseTarget} className={linkClass}>
          {content}
        </PageAwareLink>
      ) : link?.kind === "record" ? (
        <RecordLink targetId={link.targetId} className={linkClass}>
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
