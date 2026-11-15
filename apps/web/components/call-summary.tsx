"use client";

import { useObject } from "@ai-sdk/react";
import { useState, useTransition } from "react";
import { saveNoteAction } from "@/app/vehicles/[vin]/save-note-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type CallSummary as Draft, callSummarySchema, MAX_TRANSCRIPT_LENGTH } from "@/lib/call-summary-schema";

export type CaseOption = { id: string; label: string; open: boolean };

type Props = {
  vin: string;
  cases: CaseOption[];
  cannedTranscript?: { label: string; text: string };
};

// Paste a transcript → the AI draft streams in → the rep edits it, picks a case, and saves.
// Nothing reaches the case system until the rep presses Save. See docs/decisions.md#call-summary
export function CallSummary({ vin, cases, cannedTranscript }: Props) {
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const { object, submit, isLoading, error } = useObject({
    api: "/api/call-summary",
    schema: callSummarySchema,
    onFinish: ({ object }) => setDraft(object ?? null),
  });

  function generate() {
    setDraft(null);
    setSaved(false);
    submit({ vin, transcript });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call summary</CardTitle>
        <CardDescription>
          Paste the call transcript. The assistant drafts a case note; you review it before anything is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Paste the call transcript here"
          aria-label="Call transcript"
          rows={6}
          maxLength={MAX_TRANSCRIPT_LENGTH}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={isLoading || !transcript.trim()}>
            {isLoading ? "Drafting…" : "Draft summary"}
          </Button>
          {cannedTranscript && (
            <Button variant="outline" onClick={() => setTranscript(cannedTranscript.text)} disabled={isLoading}>
              Use example: {cannedTranscript.label}
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Couldn&apos;t draft a summary. Try again in a moment.</AlertDescription>
          </Alert>
        )}

        {isLoading && object && <StreamingPreview draft={object} />}

        {draft && !saved && (
          <ReviewForm key={JSON.stringify(draft)} vin={vin} cases={cases} draft={draft} onSaved={() => setSaved(true)} />
        )}

        {saved && (
          <Alert>
            <AlertDescription>Saved to the case. It now appears in Case history.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function StreamingPreview({ draft }: { draft: Partial<Record<keyof Draft, unknown>> & { nextSteps?: unknown[] } }) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
      {typeof draft.issue === "string" && <p className="font-medium">{draft.issue}</p>}
      {typeof draft.summary === "string" && <p>{draft.summary}</p>}
      {Array.isArray(draft.nextSteps) && (
        <ul className="list-disc pl-5">
          {draft.nextSteps.map((step, i) => typeof step === "string" && <li key={i}>{step}</li>)}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({
  vin,
  cases,
  draft,
  onSaved,
}: {
  vin: string;
  cases: CaseOption[];
  draft: Draft;
  onSaved: () => void;
}) {
  const latestOpen = cases.find((c) => c.open);
  const [caseId, setCaseId] = useState(latestOpen?.id ?? "new");
  const [issue, setIssue] = useState(draft.issue);
  const [summary, setSummary] = useState(draft.summary);
  const [nextSteps, setNextSteps] = useState(draft.nextSteps.join("\n"));
  const [subject, setSubject] = useState(draft.suggestedCase.subject);
  const [category, setCategory] = useState(draft.suggestedCase.category);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveNoteAction({
        vin,
        caseId,
        newCase: caseId === "new" ? { subject, category } : undefined,
        issue,
        summary,
        nextSteps: nextSteps.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Review the draft</p>

      <div className="space-y-1">
        <Label htmlFor="issue">Issue</Label>
        <Input id="issue" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={300} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={4000} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="next-steps">Next steps (one per line)</Label>
        <Textarea id="next-steps" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={4} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="case">Save to</Label>
        <select
          id="case"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value="new">New case</option>
        </select>
      </div>

      {caseId === "new" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="subject">New case subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} />
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save to case"}
      </Button>
    </div>
  );
}
