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
    phone: z.string(),
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
  number: z.number().int(),
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
      // A rep's quick note may have no issue; AI-drafted notes always do.
      issue: z.string().nullable(),
      summary: z.string(),
      nextSteps: z.array(z.string()),
      createdAt: z.string(),
    }),
  ),
});

const customerSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  vehicles: z.array(
    z.object({
      vin: z.string(),
      color: z.string(),
      model: z.object({ year: z.number(), make: z.string(), model: z.string(), trim: z.string() }),
    }),
  ),
});

export type Vehicle = z.infer<typeof vehicleSchema>;
export type TelematicsEvent = z.infer<typeof telematicsEventSchema>;
export type Case = z.infer<typeof caseSchema>;
export type Customer = z.infer<typeof customerSchema>;

const vinPath = (vin: string) => `/vehicles/${encodeURIComponent(vin)}`;

// Straight reads from the vehicle API. Pages and the agent go through the cached wrappers in
// cached-reads.ts; evals call these directly, outside a Next.js request.
export function fetchVehicle(vin: string): Promise<Vehicle | null> {
  return vehicleApiOrNull(vinPath(vin), vehicleSchema);
}

export function fetchCases(vin: string): Promise<Case[] | null> {
  return vehicleApiOrNull(`${vinPath(vin)}/cases`, z.array(caseSchema));
}

export function fetchTelematics(vin: string, limit = 50): Promise<TelematicsEvent[] | null> {
  return vehicleApiOrNull(`${vinPath(vin)}/telematics?limit=${limit}`, z.array(telematicsEventSchema));
}

// Coded faults recorded between two ISO times, inclusive. Readings without a code (battery,
// odometer) are left out: they can fill a week many times over the API's 200-event cap.
export function fetchFaultsInWindow(vin: string, from: string, to: string): Promise<TelematicsEvent[] | null> {
  const query = new URLSearchParams({ from, to, codedOnly: "true", limit: "200" });
  return vehicleApiOrNull(`${vinPath(vin)}/telematics?${query}`, z.array(telematicsEventSchema));
}

// Not cached, and only called from the search Server Action, so the email never appears in a URL.
// See docs/decisions.md#caching
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  return vehicleApiOrNull(`/customers?email=${encodeURIComponent(email)}`, customerSchema);
}
