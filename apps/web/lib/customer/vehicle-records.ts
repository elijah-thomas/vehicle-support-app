import "server-only";
import { z } from "zod";
import { vehicleApiOrNull } from "./vehicle-api";

const vehicleSchema = z.object({
  vin: z.string(),
  color: z.string(),
  purchasedAt: z.string(),
  softwareVersion: z.string(),
  installedOptions: z.array(z.string()),
  model: z.object({
    year: z.number(),
    make: z.string(),
    model: z.string(),
    trim: z.string(),
    powertrain: z.enum(["EV", "HYBRID", "GAS"]),
    batteryKwh: z.number().nullable(),
    rangeMiles: z.number().nullable(),
    engine: z.string().nullable(),
    towingLbs: z.number().nullable(),
  }),
  customer: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    vehicles: z.array(
      z.object({
        vin: z.string(),
        model: z.object({ year: z.number(), make: z.string(), model: z.string(), trim: z.string() }),
      }),
    ),
  }),
  recalls: z.array(
    z.object({
      status: z.enum(["OPEN", "COMPLETED"]),
      completedAt: z.string().nullable(),
      recall: z.object({
        campaignNumber: z.string(),
        title: z.string(),
        description: z.string(),
        remedy: z.string(),
      }),
    }),
  ),
});

const telematicsEventSchema = z.object({
  id: z.string(),
  recordedAt: z.string(),
  type: z.enum(["DTC", "BATTERY", "ODOMETER", "SOFTWARE"]),
  code: z.string().nullable(),
  severity: z.enum(["INFO", "WARN", "CRITICAL"]),
  message: z.string(),
  value: z.number().nullable(),
});

const caseSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "CLOSED"]),
  category: z.string(),
  subject: z.string(),
  description: z.string(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  notes: z.array(
    z.object({
      id: z.string(),
      source: z.enum(["REP", "AI_DRAFT_EDITED"]),
      issue: z.string(),
      summary: z.string(),
      nextSteps: z.array(z.string()),
      createdAt: z.string(),
    }),
  ),
});

export type Vehicle = z.infer<typeof vehicleSchema>;
export type TelematicsEvent = z.infer<typeof telematicsEventSchema>;
export type Case = z.infer<typeof caseSchema>;

const vinPath = (vin: string) => `/vehicles/${encodeURIComponent(vin)}`;

// Straight reads from the vehicle API. Pages and the agent go through the cached wrappers in
// vehicles.ts; evals call these directly, outside a Next.js request.
export function fetchVehicle(vin: string): Promise<Vehicle | null> {
  return vehicleApiOrNull(vinPath(vin), vehicleSchema);
}

export function fetchCases(vin: string): Promise<Case[] | null> {
  return vehicleApiOrNull(`${vinPath(vin)}/cases`, z.array(caseSchema));
}

export function fetchTelematics(vin: string, limit = 50): Promise<TelematicsEvent[] | null> {
  return vehicleApiOrNull(`${vinPath(vin)}/telematics?limit=${limit}`, z.array(telematicsEventSchema));
}
