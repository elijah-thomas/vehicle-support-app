import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Same layout as VehicleSpecs: a grid of label and value pairs.
export function VehicleSpecsSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
