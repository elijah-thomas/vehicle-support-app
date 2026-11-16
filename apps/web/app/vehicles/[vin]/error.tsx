"use client";

import { Button } from "@/components/ui/button";

// Shown when the customer's systems can't be reached (for example, GCP is down). Renders in the
// record's column; the assistant beside it stays.
export default function VehicleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="order-1 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this vehicle</h1>
      <p className="mt-2 text-muted-foreground">The vehicle data service didn&apos;t respond. Try again in a moment.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
