"use client";

import { Button } from "@/components/ui/button";

// Shown when the customer's systems can't be reached (for example, GCP is down).
export default function VehicleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this vehicle</h1>
      <p className="mt-2 text-muted-foreground">The vehicle data service didn&apos;t respond. Try again in a moment.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
