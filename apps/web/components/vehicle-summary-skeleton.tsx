import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Same layout as VehicleSummary: title, owner line, status pills, spec grid. Open-recall alerts
// can't be predicted, so they still arrive above the card.
export function VehicleSummarySkeleton() {
  return (
    <Card role="status">
      <CardContent className="space-y-3">
        <span className="sr-only">Loading vehicle…</span>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-[120px]" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
