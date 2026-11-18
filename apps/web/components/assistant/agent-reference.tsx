"use client";

import { usePathname, useRouter } from "next/navigation";
import { RecordLink } from "@/components/shared/record-link";
import { flashWhenPresent } from "@/lib/flash-element";
import { vehicleView } from "@/lib/vehicle-paths";

const chipClass = "rounded-sm bg-muted px-1 font-mono text-xs";
const linkClass = `${chipClass} text-accent-foreground underline underline-offset-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`;

// Telematics streams in fresh after a client navigation, so give the overview longer to show it.
const AFTER_NAVIGATION_MS = 8000;

// Recall banners live in the [vin] layout, so they're on every page and can be checked once, when the
// answer renders (answers only exist in the browser, so reading the DOM here is safe).
export function RecallReference({ label, targetId }: { label: string; targetId: string }) {
  const exists = typeof document !== "undefined" && document.getElementById(targetId) !== null;
  if (!exists) return <span className={chipClass}>{label}</span>;
  return (
    <RecordLink targetId={targetId} className={linkClass}>
      {label}
    </RecordLink>
  );
}

// Decision (D43): a fault code finds its row when clicked, not when the answer renders. Why: the
// chat stays mounted while the left column changes, and older rows sit in a collapsed list, so a
// check at render time goes stale. Trade-off: a code with no row lands on the telematics panel.
// See docs/decisions.md#layout-freshness
export function FaultReference({ vin, code }: { vin: string; code: string }) {
  const router = useRouter();
  const onOverview = vehicleView(usePathname(), vin).kind === "overview";
  const overview = `/vehicles/${vin}`;
  const targetId = `dtc-${code}`;

  return (
    <a
      href={`${overview}#${targetId}`}
      className={linkClass}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (onOverview) return flashWhenPresent(targetId, { fallbackId: "telematics" });
        router.push(overview);
        flashWhenPresent(targetId, { fallbackId: "telematics", timeoutMs: AFTER_NAVIGATION_MS });
      }}
    >
      {code}
    </a>
  );
}
