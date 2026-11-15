import "server-only";
import type { z } from "zod";
import { env } from "@/lib/env";
import { getVehicleApiIdToken } from "./auth";

export class VehicleApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Every call across the boundary goes through here: authenticate, fetch, validate the shape.
export async function vehicleApi<T>(path: string, schema: z.ZodType<T>, init?: RequestInit) {
  const token = await getVehicleApiIdToken();
  const response = await fetch(new URL(path, env.VEHICLE_API_URL), {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new VehicleApiError(
      response.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Vehicle API returned ${response.status}`,
    );
  }
  return schema.parse(body);
}
