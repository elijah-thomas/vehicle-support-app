import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { vehicleApiOrNull } from "./vehicle-api";

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

export type Customer = z.infer<typeof customerSchema>;

// Not cached: searches are rarely repeated.
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  await connection();
  return vehicleApiOrNull(`/customers?email=${encodeURIComponent(email)}`, customerSchema);
}
