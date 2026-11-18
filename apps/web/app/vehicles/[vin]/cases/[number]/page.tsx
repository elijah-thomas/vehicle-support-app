import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaseDetail } from "@/components/cases/case-detail";
import { CaseDetailSkeleton } from "@/components/cases/case-detail-skeleton";
import { WithVin } from "../../with-vin";

// One case, at the number reps use (CS-24117 → /cases/24117), under the shared header. A static
// shell like the overview: the case comes from the cached case list (D41), and its fault history
// reads telematics windows (cached once settled, D37) behind its own boundary.
export default function CasePage({ params }: PageProps<"/vehicles/[vin]/cases/[number]">) {
  return (
    <Suspense fallback={<CaseDetailSkeleton />}>
      <CaseFromParams params={params} />
    </Suspense>
  );
}

async function CaseFromParams({ params }: { params: PageProps<"/vehicles/[vin]/cases/[number]">["params"] }) {
  const { number } = await params;
  if (!/^[1-9]\d{0,9}$/.test(number)) notFound();
  return <WithVin params={params}>{(vin) => <CaseDetail vin={vin} number={Number(number)} />}</WithVin>;
}
