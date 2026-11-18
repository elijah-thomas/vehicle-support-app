import "server-only";
import { cache } from "react";
import { getCases, getTelematics } from "./cached-reads";

// The cached case list, read once per request and shared by the status row, the overview panels,
// the case view and the assistant's suggestions, so they all show the same cases.
export const getCaseSnapshot = cache(async (vin: string) => {
  const cases = await getCases(vin);
  return cases && { cases };
});

const TELEMATICS_LIMIT = 20;

// One fetch and one clock reading per request, shared by the telematics panel and the status row,
// so their repeat counts and relative times agree. Still fresh on every request (see getTelematics).
export const getTelematicsSnapshot = cache(async (vin: string) => {
  const events = await getTelematics(vin, TELEMATICS_LIMIT);
  return events && { events, fetchedAt: Date.now() };
});
