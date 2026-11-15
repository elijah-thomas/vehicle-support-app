import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentChat } from "@/components/agent-chat";
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
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← New lookup
      </Link>

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <WithVin params={params}>{(vin) => <VehicleSummary vin={vin} />}</WithVin>
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={2} />}>
        <WithVin params={params}>{(vin) => <AgentChat vin={vin} />}</WithVin>
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton />}>
          <WithVin params={params}>{(vin) => <TelematicsPanel vin={vin} />}</WithVin>
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <WithVin params={params}>{(vin) => <CaseHistory vin={vin} />}</WithVin>
        </Suspense>
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
