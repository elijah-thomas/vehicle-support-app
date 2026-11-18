import { Suspense } from "react";
import { AgentChat } from "@/components/assistant/agent-chat";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { CallSummaryForm } from "@/components/assistant/call-summary-form";
import { CallSummaryPanel } from "@/components/assistant/call-summary-panel";
import { VehicleHeader } from "@/components/vehicle/vehicle-header";
import { VehicleHeaderSkeleton } from "@/components/vehicle/vehicle-header-skeleton";
import { VehicleTrail } from "@/components/vehicle/vehicle-trail";
import { WithVin } from "./with-vin";
import { loadSuggestions } from "@/lib/assistant/assistant-suggestions";

// Decision (D8): the layout owns the header and the assistant, and each route (the overview, a
// case, a new case) replaces only the left column below the header. Moving between them keeps the
// chat thread, any unsaved draft and the breadcrumb trail. See docs/decisions.md#vehicle-layout
export default function VehicleLayout({ children, params }: LayoutProps<"/vehicles/[vin]">) {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-6 xl:px-6">
      {/* Two independent columns, so a tall assistant never stretches the record's rows.
          Below lg the left wrapper is display: contents and order puts the assistant second. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel-md)] lg:items-start xl:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel)]">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-1">
            <Suspense fallback={<VehicleHeaderSkeleton />}>
              <WithVin params={params}>{(vin) => <VehicleHeader vin={vin} />}</WithVin>
            </Suspense>
          </div>
          <div className="order-3 flex min-w-0 flex-col gap-6">
            <Suspense fallback={null}>
              <WithVin params={params}>{(vin) => <VehicleTrail key={vin} vin={vin} />}</WithVin>
            </Suspense>
            {children}
          </div>
        </div>

        <aside
          aria-label="Assistant"
          className="order-2 lg:sticky lg:top-18 lg:col-start-2 lg:row-start-1 lg:h-[calc(100dvh-6rem)]"
        >
          <AssistantPanel
            ask={
              <Suspense fallback={<AgentChat vin={null} suggestions={null} />}>
                {/* Decision (D19): suggestions start here, unawaited, and only their rows wait.
                    See docs/decisions.md#assistant-suggestions */}
                <WithVin params={params}>{(vin) => <AgentChat vin={vin} suggestions={loadSuggestions(vin)} />}</WithVin>
              </Suspense>
            }
            callSummary={
              <Suspense fallback={<CallSummaryForm vin={null} cases={[]} />}>
                <WithVin params={params}>{(vin) => <CallSummaryPanel vin={vin} />}</WithVin>
              </Suspense>
            }
          />
        </aside>
      </div>
    </main>
  );
}
