import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The panel's real title is static, so it prerenders in the shell; only the rows wait for data.
// rowClassName sizes each placeholder like one of the panel's real rows.
export function PanelSkeleton({
  title,
  rows = 4,
  rowClassName = "h-4 w-full",
}: {
  title: string;
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <Card role="status">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-2">
        <span className="sr-only">Loading {title.toLowerCase()}…</span>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={rowClassName} />
        ))}
      </CardContent>
    </Card>
  );
}
