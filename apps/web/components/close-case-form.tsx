"use client";

import { CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { closeCaseAction } from "@/app/vehicles/[vin]/cases/[caseId]/case-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Closing asks for the outcome: earlier-case summaries and the assistant read it later.
// See docs/decisions.md#case-view
export function CloseCaseForm({ vin, caseId }: { vin: string; caseId: string }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closing, startClosing] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Close case
      </Button>
    );
  }

  function close(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startClosing(async () => {
      try {
        const result = await closeCaseAction({ vin, caseId, resolution });
        if (!result.ok) setError(result.error);
      } catch {
        setError("Closing didn't go through. Try again in a moment.");
      }
    });
  }

  return (
    <form onSubmit={close} className="w-full space-y-2 rounded-md border p-3">
      <Label htmlFor="resolution">Resolution</Label>
      <Textarea
        id="resolution"
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="What fixed it, or why the case is closing"
        autoFocus
      />
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={closing || !resolution.trim()}>
          {closing ? "Closing…" : "Close case"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={closing}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
