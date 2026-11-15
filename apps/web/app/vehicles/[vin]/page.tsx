import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentChat } from "@/components/agent-chat";
import { CallSummaryPanel } from "@/components/call-summary-panel";
import { CaseHistory } from "@/components/case-history";
import { PanelSkeleton } from "@/components/panel-skeleton";
import { TelematicsPanel } from "@/components/telematics-panel";
import { VehicleSummary } from "@/components/vehicle-summary";
import { VIN_PATTERN } from "@/lib/format";

// The page itself is a static shell: layout, headings, and skeletons arrive instantly.
// Each panel streams in independently, so slow telematics never blocks the vehicle summary.
//   vehicle + specs + recalls → cached (hours)        see lib/customer/vehicles.ts
//   cases                     → cached (minutes), cleared when a note is saved
//   telematics                → always fresh
export default function VehiclePage({ params }: PageProps<"/vehicles/[vin]">) {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-8 xl:px-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← New lookup
      </Link>

      {/* Below lg the assistant sits right under the vehicle summary; from lg it docks as a
          sticky right column so it stays in view while the rep scrolls telematics and cases. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel-md)] xl:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel)]">
        <Suspense fallback={<PanelSkeleton rows={6} />}>
          <WithVin params={params}>{(vin) => <VehicleSummary vin={vin} />}</WithVin>
        </Suspense>

        <aside
          aria-label="Assistant"
          className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-[calc(100dvh-3rem)] lg:self-start"
        >
          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <WithVin params={params}>{(vin) => <AgentChat vin={vin} />}</WithVin>
          </Suspense>
        </aside>

        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <WithVin params={params}>{(vin) => <CallSummaryPanel vin={vin} />}</WithVin>
        </Suspense>

        <div className="grid gap-6 lg:col-start-1 xl:grid-cols-2">
          <Suspense fallback={<PanelSkeleton />}>
            <WithVin params={params}>{(vin) => <TelematicsPanel vin={vin} />}</WithVin>
          </Suspense>
          <Suspense fallback={<PanelSkeleton />}>
            <WithVin params={params}>{(vin) => <CaseHistory vin={vin} />}</WithVin>
          </Suspense>
        </div>
      </div>
    </main>
  );
}

// Reading params is request-time work, so it happens inside each Suspense boundary.
async function WithVin({
  params,
  children,
}: {
  params: PageProps<"/vehicles/[vin]">["params"];
  children: (vin: string) => React.ReactNode;
}) {
  const vin = (await params).vin.toUpperCase();
  if (!VIN_PATTERN.test(vin)) notFound();
  return children(vin);
}
