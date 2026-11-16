"use client";

import { CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { addRepNoteAction } from "@/app/vehicles/[vin]/cases/[caseId]/case-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// A note written by the rep, without a transcript. Same fields as a reviewed call summary.
export function CaseNoteForm({ vin, caseId }: { vin: string; caseId: string }) {
  const [issue, setIssue] = useState("");
  const [summary, setSummary] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      try {
        const result = await addRepNoteAction({
          vin,
          caseId,
          issue,
          summary,
          nextSteps: nextSteps.split("\n").map((s) => s.trim()).filter(Boolean),
        });
        if (!result.ok) return setError(result.error);
        setIssue("");
        setSummary("");
        setNextSteps("");
      } catch {
        setError("The save didn't go through. Your note is still here. Try again in a moment.");
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <h2 className="text-sm font-medium">Add a note</h2>
      <div className="space-y-1">
        <Label htmlFor="note-issue">Issue</Label>
        <Input id="note-issue" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={300} placeholder="What this contact was about" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="note-summary">Summary</Label>
        <Textarea id="note-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={4000} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="note-next-steps">Next steps (one per line)</Label>
        <Textarea id="note-next-steps" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} />
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save note"}
        </Button>
        <p className="text-xs text-muted-foreground">Have a transcript? Use Call summary in the assistant.</p>
      </div>
    </form>
  );
}
