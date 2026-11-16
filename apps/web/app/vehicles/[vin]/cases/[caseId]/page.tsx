import { Suspense } from "react";
import { CaseDetail } from "@/components/case-detail";
import { CaseVehicleHeader } from "@/components/case-vehicle-header";
import { CaseDetailSkeleton } from "@/components/case-detail-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { WithVin } from "@/components/with-vin";

// Static shell like the vehicle page. The case comes from the cached case list; its related
// faults read telematics windows (cached once settled, D49) behind their own boundary. The
// assistant is in the [vin] layout.
export default function CasePage({ params }: PageProps<"/vehicles/[vin]/cases/[caseId]">) {
  return (
    <>
      <div className="order-1">
        <Suspense fallback={<Skeleton className="h-10 w-80" />}>
          <WithVin params={params}>{(vin) => <CaseVehicleHeader vin={vin} />}</WithVin>
        </Suspense>
      </div>
      <div className="order-3">
        <Suspense fallback={<CaseDetailSkeleton />}>
          <CaseFromParams params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function CaseFromParams({ params }: { params: PageProps<"/vehicles/[vin]/cases/[caseId]">["params"] }) {
  const { caseId } = await params;
  return <WithVin params={params}>{(vin) => <CaseDetail vin={vin} caseId={caseId} />}</WithVin>;
}
