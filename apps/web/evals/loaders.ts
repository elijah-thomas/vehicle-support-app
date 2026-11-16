import type { VehicleLoaders } from "@/lib/ai/vehicle-agent";
import { fetchCases, fetchTelematics, fetchVehicle } from "@/lib/customer/vehicle-records";

// Same staging API and OIDC → WIF path as the app, minus the Next.js cache. Each record is
// fetched once per run: the data doesn't change mid-run, and dozens of parallel cases would
// otherwise trip the API's per-IP rate limit.
function once<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const results = new Map<string, Promise<R>>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    if (!results.has(key)) results.set(key, fn(...args));
    return results.get(key)!;
  };
}

export const loaders: VehicleLoaders = {
  getVehicle: once(fetchVehicle),
  getTelematics: once(fetchTelematics),
  getCases: once(fetchCases),
};
