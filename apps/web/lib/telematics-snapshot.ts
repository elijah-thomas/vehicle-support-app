import "server-only";
import { cache } from "react";
import { getTelematics } from "@/lib/customer/vehicles";

const TELEMATICS_LIMIT = 20;

// One fetch and one clock reading per request, shared by the telematics panel and the status row,
// so their repeat counts and relative times agree. Still fresh on every request (see getTelematics).
export const getTelematicsSnapshot = cache(async (vin: string) => {
  const events = await getTelematics(vin, TELEMATICS_LIMIT);
  return events && { events, fetchedAt: Date.now() };
});
