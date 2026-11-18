import type { VehicleLoaders } from "@/lib/ai/vehicle-agent";
import { fetchCases, fetchTelematics, fetchVehicle } from "@/lib/customer/reads";

// Eve runs the agent outside Next.js, so the page's cached reads aren't available. These call the
// API directly, through the same OIDC → WIF path (D3).
export const uncachedLoaders: VehicleLoaders = {
  getVehicle: fetchVehicle,
  getCases: fetchCases,
  getTelematics: fetchTelematics,
};

type Caller = { attributes?: Record<string, unknown> } | null | undefined;

// Decision (D28): the vehicle comes from the caller that started the conversation, which never
// changes, so neither the model nor a later message can move it to another vehicle (D16).
// See docs/decisions.md#eve-assistant
export function sessionVin(auth: { initiator?: Caller }): string {
  const vin = auth.initiator?.attributes?.vin;
  if (typeof vin !== "string") throw new Error("The conversation has no vehicle");
  return vin;
}
