import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { cacheTags } from "./cache-tags";
import {
  type Case,
  fetchCases,
  fetchTelematics,
  fetchFaultsInWindow,
  fetchVehicle,
  type TelematicsEvent,
  type Vehicle,
} from "./vehicle-records";

export type { Case, TelematicsEvent, Vehicle };

// Decision (D24): cached for hours in Vercel's shared Runtime Cache ("use cache: remote").
// Why: specs never change and recall status rarely does; a shared cache lets updateTag reach
// every instance. Trade-off: owner details and recalls can be about an hour stale, and personal
// data is kept up to a day. See docs/decisions.md#vehicle-page-caching
export async function getVehicle(vin: string): Promise<Vehicle | null> {
  "use cache: remote";
  cacheTag(cacheTags.vehicle(vin));

  const vehicle = await fetchVehicle(vin);
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

  return fetchCases(vin);
}

// Never cached: a rep needs current fault codes. connection() marks this as request-time work.
export async function getTelematics(vin: string, limit = 50): Promise<TelematicsEvent[] | null> {
  await connection();
  return fetchTelematics(vin, limit);
}

const SETTLE_MS = 24 * 60 * 60 * 1000;

// Decision (D49): a past window is cached once it ended more than a day ago; newer ones read fresh.
// Why: vehicles upload buffered events late, so a window is only safe to cache once it has
// settled. Trade-off: a later upload into a settled window shows within a day.
// See docs/decisions.md#telematics-windows
export async function getFaultsInWindow(vin: string, from: string, to: string): Promise<TelematicsEvent[] | null> {
  await connection();
  if (Date.now() - Date.parse(to) < SETTLE_MS) return fetchFaultsInWindow(vin, from, to);
  return getSettledFaultsInWindow(vin, from, to);
}

async function getSettledFaultsInWindow(vin: string, from: string, to: string) {
  "use cache: remote";
  cacheTag(cacheTags.telematics(vin));
  cacheLife("days");
  return fetchFaultsInWindow(vin, from, to);
}
