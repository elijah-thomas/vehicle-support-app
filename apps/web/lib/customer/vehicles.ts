import "server-only";
import { z } from "zod";
import { vehicleApi } from "./vehicle-api";

export const vehicleSchema = z.object({
  vin: z.string(),
  color: z.string(),
  softwareVersion: z.string(),
  installedOptions: z.array(z.string()),
  model: z.object({
    year: z.number(),
    make: z.string(),
    model: z.string(),
    trim: z.string(),
    powertrain: z.enum(["EV", "HYBRID", "GAS"]),
  }),
  recalls: z.array(
    z.object({
      status: z.enum(["OPEN", "COMPLETED"]),
      recall: z.object({ campaignNumber: z.string(), title: z.string() }),
    }),
  ),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

export function getVehicle(vin: string) {
  return vehicleApi(`/vehicles/${encodeURIComponent(vin)}`, vehicleSchema);
}
