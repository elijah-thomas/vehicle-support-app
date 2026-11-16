import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentChat } from "@/components/agent-chat";
import { AssistantPanel } from "@/components/assistant-panel";
import { CallSummaryPanel } from "@/components/call-summary-panel";
import { CaseHistory } from "@/components/case-history";
import { PanelSkeleton } from "@/components/panel-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
    <main className="mx-auto w-full max-w-content px-4 py-6 xl:px-6">
      {/* Two independent columns, so a tall assistant never stretches the record's rows.
          Below lg the left wrapper is display: contents and order puts the assistant second. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel-md)] lg:items-start xl:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel)]">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-1">
            <Suspense fallback={<PanelSkeleton rows={6} />}>
              <WithVin params={params}>{(vin) => <VehicleSummary vin={vin} />}</WithVin>
            </Suspense>
          </div>

          <div className="order-3 grid gap-6 xl:grid-cols-2">
            <Suspense fallback={<PanelSkeleton />}>
              <WithVin params={params}>{(vin) => <TelematicsPanel vin={vin} />}</WithVin>
            </Suspense>
            <Suspense fallback={<PanelSkeleton />}>
              <WithVin params={params}>{(vin) => <CaseHistory vin={vin} />}</WithVin>
            </Suspense>
          </div>
        </div>

        <aside
          aria-label="Assistant"
          className="order-2 lg:sticky lg:top-18 lg:col-start-2 lg:row-start-1 lg:h-[calc(100dvh-6rem)]"
        >
          <AssistantPanel
            ask={
              <Suspense fallback={<ChatSkeleton />}>
                <WithVin params={params}>{(vin) => <AgentChat vin={vin} />}</WithVin>
              </Suspense>
            }
            callSummary={
              <Suspense fallback={<ChatSkeleton />}>
                <WithVin params={params}>{(vin) => <CallSummaryPanel vin={vin} />}</WithVin>
              </Suspense>
            }
          />
        </aside>
      </div>
    </main>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-full" />
    </div>
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
