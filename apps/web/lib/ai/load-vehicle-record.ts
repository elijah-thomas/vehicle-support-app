import "server-only";
import type { VehicleLoaders } from "./vehicle-agent";
import { UNAVAILABLE, type VehicleRecord } from "./model-context";

export const RECORD_TELEMATICS = 20;

// Decision (D16): the record is loaded before the model runs, not fetched by tools. Why: the evals
// showed the agent fetched all of it for every question, so that round-trip decided nothing.
// Trade-off: every request carries the record's tokens. See docs/decisions.md#agent
// Vehicle details are required; if cases or telematics fail, the record says so and the model
// tells the rep, as the page does.
export async function loadVehicleRecord(vin: string, loaders: VehicleLoaders): Promise<VehicleRecord | null> {
  const [vehicle, cases, telematics] = await Promise.allSettled([
    loaders.getVehicle(vin),
    loaders.getCases(vin),
    loaders.getTelematics(vin, RECORD_TELEMATICS),
  ]);
  if (vehicle.status === "rejected") throw vehicle.reason;
  if (!vehicle.value) return null;

  return {
    vehicle: vehicle.value,
    cases: settled(cases),
    telematics: settled(telematics),
  };
}

function settled<T>(result: PromiseSettledResult<T>): T | typeof UNAVAILABLE {
  if (result.status === "fulfilled") return result.value;
  console.error("vehicle record source failed", result.reason);
  return UNAVAILABLE;
}
