"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Stands in for a panel whose data couldn't load. Retry re-renders the page's server components,
// so only the data that failed is fetched again (the rest comes from cache).
export function PanelUnavailable({ title, id }: { title: string; id?: string }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <Card id={id} className="scroll-mt-18">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p role="alert" className="flex items-start gap-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {title} couldn&apos;t be loaded from the vehicle data service. The rest of the record is still current.
        </p>
        <Button variant="outline" size="sm" onClick={() => startRetry(() => router.refresh())} disabled={retrying}>
          <RotateCw data-icon="inline-start" aria-hidden />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </CardContent>
    </Card>
  );
}
