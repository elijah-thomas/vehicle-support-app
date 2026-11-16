"use client";

import { Button } from "@/components/ui/button";

// Last resort for the lookup page; expected failures (the customer system being down) are
// handled in the search action and shown inline.
export default function LookupError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">Lookup unavailable</h1>
      <p className="mt-2 text-muted-foreground">Something went wrong loading the lookup. Try again in a moment.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
