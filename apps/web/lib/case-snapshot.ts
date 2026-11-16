import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { getCases } from "@/lib/customer/vehicles";

// The cached case list plus one clock reading per request, shared by the status row, Case
// history, and the case view, so they agree on what's overdue. The clock makes this
// request-time work, inside each caller's Suspense boundary. See docs/decisions.md#case-view
export const getCaseSnapshot = cache(async (vin: string) => {
  const cases = await getCases(vin);
  await connection();
  return cases && { cases, now: Date.now() };
});
