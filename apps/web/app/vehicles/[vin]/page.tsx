import { Suspense } from "react";
import { CaseHistory } from "@/components/cases/case-history";
import { PanelSkeleton } from "@/components/shared/panel-skeleton";
import { TelematicsPanel } from "@/components/vehicle/telematics-panel";
import { VehicleSpecs } from "@/components/vehicle/vehicle-specs";
import { VehicleSpecsSkeleton } from "@/components/vehicle/vehicle-specs-skeleton";
import { WithVin } from "./with-vin";

// The overview: the left column under the shared header (layout.tsx). A static shell of headings
// and skeletons; each panel streams in on its own, so slow telematics never blocks the rest.
//   specs        → cached (hours)                                     see lib/customer/cached-reads.ts
//   cases        → cached (minutes), cleared by every case write
//   telematics   → always fresh
export default function VehicleOverviewPage({ params }: PageProps<"/vehicles/[vin]">) {
  return (
    <>
      <Suspense fallback={<VehicleSpecsSkeleton />}>
        <WithVin params={params}>{(vin) => <VehicleSpecs vin={vin} />}</WithVin>
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Telematics" rows={8} rowClassName="h-8 w-full" />}>
          <WithVin params={params}>{(vin) => <TelematicsPanel vin={vin} />}</WithVin>
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Case history" rows={3} rowClassName="h-16 w-full" />}>
          <WithVin params={params}>{(vin) => <CaseHistory vin={vin} />}</WithVin>
        </Suspense>
      </div>
    </>
  );
}
