import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Same layout as CaseDetail: number and status, subject, four fields, then the activity. Fault
// history isn't drawn: not every case has one, and the column appears only when it does.
export function CaseDetailSkeleton() {
  return (
    <Card role="status" className="gap-0 py-0">
      <span className="sr-only">Loading case…</span>
      <div className="space-y-3 border-b p-4">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-7 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </Card>
  );
}
