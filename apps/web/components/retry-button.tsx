"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

// Re-renders the route's server components, so only the data that failed is fetched again (the
// rest comes from cache).
export function RetryButton() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <Button variant="outline" size="sm" onClick={() => startRetry(() => router.refresh())} disabled={retrying}>
      <RotateCw data-icon="inline-start" aria-hidden />
      {retrying ? "Retrying…" : "Retry"}
    </Button>
  );
}
