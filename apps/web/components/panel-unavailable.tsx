import { CircleAlert } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Stands in for a panel whose data couldn't load. Only the Retry button runs in the browser.
export function PanelUnavailable({
  title,
  id,
  message = `${title} couldn't be loaded from the vehicle data service. The rest of the record is still current.`,
}: {
  title: string;
  id?: string;
  message?: string;
}) {
  return (
    <Card id={id} className="scroll-mt-18">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p role="alert" className="flex items-start gap-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {message}
        </p>
        <RetryButton />
      </CardContent>
    </Card>
  );
}
