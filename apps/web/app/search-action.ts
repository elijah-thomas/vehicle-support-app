"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { findCustomerByEmail } from "@/lib/customer/customers";
import { VIN_PATTERN } from "@/lib/format";

export type SearchState = {
  error?: string;
  customer?: {
    name: string;
    vehicles: { vin: string; label: string }[];
  };
};

// A server action keeps the email out of the URL, browser history, and access logs.
export async function searchAction(_previous: SearchState, formData: FormData): Promise<SearchState> {
  const query = String(formData.get("query") ?? "").trim();

  if (VIN_PATTERN.test(query.toUpperCase())) {
    redirect(`/vehicles/${query.toUpperCase()}`);
  }

  if (!z.email().safeParse(query).success) {
    return { error: "Enter a 17-character VIN or a customer email address." };
  }

  let customer;
  try {
    customer = await findCustomerByEmail(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("customer lookup failed", error);
    return { error: "Couldn't reach the customer system. Try again in a moment." };
  }
  if (!customer) return { error: "No customer found with that email." };
  if (customer.vehicles.length === 1) redirect(`/vehicles/${customer.vehicles[0].vin}`);

  return {
    customer: {
      name: `${customer.firstName} ${customer.lastName}`,
      vehicles: customer.vehicles.map((v) => ({
        vin: v.vin,
        label: `${v.model.year} ${v.model.make} ${v.model.model} ${v.model.trim} · ${v.color}`,
      })),
    },
  };
}
