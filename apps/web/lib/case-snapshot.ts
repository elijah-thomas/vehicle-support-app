import "server-only";
import { cache } from "react";
import { getCases } from "@/lib/customer/vehicles";

// The cached case list, read once per request and shared by the status row, the overview panels,
// the case view and the assistant's suggestions, so they all show the same cases.
export const getCaseSnapshot = cache(async (vin: string) => {
  const cases = await getCases(vin);
  return cases && { cases };
});
