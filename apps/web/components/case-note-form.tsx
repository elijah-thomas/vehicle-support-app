"use client";

import { CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { addRepNoteAction } from "@/app/vehicles/[vin]/cases/case-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// A quick note from the rep: only its summary (D40). A transcript goes through Call summary instead.
export function CaseNoteForm({ vin, caseId }: { vin: string; caseId: string }) {
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      try {
        const result = await addRepNoteAction({ vin, caseId, summary });
        if (!result.ok) return setError(result.error);
        setSummary("");
      } catch {
        setError("The save didn't go through. Your note is still here. Try again in a moment.");
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <Label htmlFor="case-note">Add a note</Label>
      <Textarea id="case-note" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={4000} />
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || !summary.trim()}>
          {saving ? "Saving…" : "Save case note"}
        </Button>
        <p className="text-xs text-muted-foreground">Have a transcript? Use Call summary in the assistant.</p>
      </div>
    </form>
  );
}
