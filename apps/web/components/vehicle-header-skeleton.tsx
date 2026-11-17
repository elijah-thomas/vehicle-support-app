import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Same layout as VehicleHeader: title and VIN, owner line, status pills. Open-recall alerts can't be
// predicted, so they still arrive above the card.
export function VehicleHeaderSkeleton() {
  return (
    <Card role="status">
      <CardContent className="space-y-3">
        <span className="sr-only">Loading vehicle…</span>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-[120px]" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
