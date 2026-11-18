"use client";

import { Button } from "@/components/ui/button";

// Last resort for the left column: each panel, and the header in the layout above, catch their
// own data failures (D9, D8). Renders in the record's column; the header and assistant stay.
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
