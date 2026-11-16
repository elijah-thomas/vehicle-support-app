import { Suspense } from "react";
import { CaseHistory } from "@/components/case-history";
import { PanelSkeleton } from "@/components/panel-skeleton";
import { TelematicsPanel } from "@/components/telematics-panel";
import { VehicleSummary } from "@/components/vehicle-summary";
import { WithVin } from "@/components/with-vin";

// The page itself is a static shell: layout, headings, and skeletons arrive instantly.
// Each panel streams in independently, so slow telematics never blocks the vehicle summary.
//   vehicle + specs + recalls → cached (hours)        see lib/customer/vehicles.ts
//   cases                     → cached (minutes), cleared when a note is saved or a case closed
//   telematics                → always fresh
// The assistant is in layout.tsx, beside this column.
export default function VehiclePage({ params }: PageProps<"/vehicles/[vin]">) {
  return (
    <>
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
    </>
  );
}
