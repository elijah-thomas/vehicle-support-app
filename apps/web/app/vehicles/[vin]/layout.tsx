import { Suspense } from "react";
import { AgentChat } from "@/components/agent-chat";
import { AssistantPanel } from "@/components/assistant-panel";
import { CallSummaryPanel } from "@/components/call-summary-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { WithVin } from "@/components/with-vin";

// Decision (D42): the assistant lives in the layout, so moving between the vehicle and its cases
// keeps the chat thread and any unsaved draft. See docs/decisions.md#case-view
export default function VehicleLayout({ children, params }: LayoutProps<"/vehicles/[vin]">) {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-6 xl:px-6">
      {/* Two independent columns, so a tall assistant never stretches the record's rows.
          Below lg the left wrapper is display: contents and order puts the assistant second. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel-md)] lg:items-start xl:grid-cols-[minmax(0,1fr)_var(--spacing-agent-panel)]">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">{children}</div>

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
