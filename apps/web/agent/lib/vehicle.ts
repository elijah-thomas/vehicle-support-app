import type { VehicleLoaders } from "@/lib/ai/vehicle-agent";
import { fetchCases, fetchTelematics, fetchVehicle } from "@/lib/customer/vehicle-records";

// Spike: Eve runs the agent outside Next.js, so the page's "use cache: remote" fetchers aren't
// available. These call the vehicle API directly through the same OIDC → WIF path (D3).
export const uncachedLoaders: VehicleLoaders = {
  getVehicle: fetchVehicle,
  getCases: fetchCases,
  getTelematics: fetchTelematics,
};

type AuthSnapshot = { attributes?: Record<string, unknown> } | null | undefined;

// The VIN the session was started with. `initiator` never changes, so a later message can't move
// the session to another vehicle (D15's binding).
export function sessionVin(auth: { initiator?: AuthSnapshot }): string {
  const vin = auth.initiator?.attributes?.vin;
  if (typeof vin !== "string") throw new Error("Session has no vehicle");
  return vin;
}
