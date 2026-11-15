import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { z } from "zod";
import { cacheTags } from "./cache-tags";
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
  customer: z.object({ firstName: z.string(), lastName: z.string(), email: z.string() }),
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

// Specs never change and recall status changes rarely, so this is cached for hours in Vercel's
// shared Runtime Cache. It includes the owner's name: cached personal data, kept short-lived.
// See docs/decisions.md#vehicle-page-caching
export async function getVehicle(vin: string): Promise<Vehicle | null> {
  "use cache: remote";
  cacheTag(cacheTags.vehicle(vin));

  const vehicle = await vehicleApiOrNull(vinPath(vin), vehicleSchema);
  // Don't remember "not found" for hours; the VIN may be registered soon.
  if (vehicle) cacheLife("hours");
  else cacheLife("minutes");
  return vehicle;
}

// Cached briefly. Saving a note clears this tag at once; the short lifetime covers cases other
// reps add in the existing CRM, which this app never hears about.
// Returns null when the VIN doesn't exist; the vehicle summary shows "not found" for the page.
export async function getCases(vin: string): Promise<Case[] | null> {
  "use cache: remote";
  cacheTag(cacheTags.cases(vin));
  cacheLife("minutes");

  return vehicleApiOrNull(`${vinPath(vin)}/cases`, z.array(caseSchema));
}

// Never cached: a rep needs current fault codes. connection() marks this as request-time work.
export async function getTelematics(vin: string, limit = 50): Promise<TelematicsEvent[] | null> {
  await connection();
  return vehicleApiOrNull(`${vinPath(vin)}/telematics?limit=${limit}`, z.array(telematicsEventSchema));
}
