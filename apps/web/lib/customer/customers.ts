import "server-only";
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

// Not cached, and only called from the search Server Action, so the email never appears in a URL.
// See docs/decisions.md#vehicle-page-caching
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  return vehicleApiOrNull(`/customers?email=${encodeURIComponent(email)}`, customerSchema);
}
