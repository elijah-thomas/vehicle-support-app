import { Suspense } from "react";
import { NewCaseForm } from "@/components/new-case-form";
import { WithVin } from "@/components/with-vin";

// A new case, in the left column under the shared header. The form needs only the VIN.
export default function NewCasePage({ params }: PageProps<"/vehicles/[vin]/cases/new">) {
  return (
    <Suspense fallback={<NewCaseForm vin={null} />}>
      <WithVin params={params}>{(vin) => <NewCaseForm vin={vin} />}</WithVin>
    </Suspense>
  );
}
