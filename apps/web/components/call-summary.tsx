"use client";

import { useObject } from "@ai-sdk/react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { saveNoteAction, type SaveNoteResult } from "@/app/vehicles/[vin]/save-note-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type CallSummary as Draft, callSummarySchema, type CallType, MAX_TRANSCRIPT_LENGTH } from "@/lib/call-summary-schema";
import { flashWhenPresent } from "@/lib/flash-element";

export type CaseOption = { id: string; label: string; open: boolean; subject: string };

type Saved = { noteId: string; caseSubject: string };

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
  const [saved, setSaved] = useState<Saved | null>(null);

  const { object, submit, isLoading, error } = useObject({
    api: "/api/call-summary",
    schema: callSummarySchema,
    onFinish: ({ object }) => setDraft(object ?? null),
  });

  function reset() {
    setDraft(null);
    setSaved(null);
  }

  function onSaved(result: Saved) {
    setSaved(result);
    flashWhenPresent(`note-${result.noteId}`);
  }

  function generate() {
    setDraft(null);
    setSaved(null);
    submit({ vin, transcript });
  }

  const drafting = isLoading || draft !== null || saved !== null;

  if (!drafting) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          Paste the call transcript. The assistant drafts a case note; you review it before anything is saved.
        </p>
        <Textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Paste the call transcript here"
          aria-label="Call transcript"
          rows={8}
          maxLength={MAX_TRANSCRIPT_LENGTH}
          className="min-h-40 flex-1 resize-none field-sizing-fixed"
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Couldn&apos;t draft a summary. Try again in a moment.</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={!transcript.trim()}>
            Draft summary
          </Button>
          {cannedTranscript && (
            <Button variant="outline" onClick={() => setTranscript(cannedTranscript.text)} title={cannedTranscript.label}>
              Use example transcript
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {isLoading && (
        <>
          <p className="text-xs text-muted-foreground">Drafting from the transcript and this vehicle&apos;s record…</p>
          {object && <StreamingPreview draft={object} />}
        </>
      )}

      {draft && !saved && (
        <ReviewForm key={JSON.stringify(draft)} vin={vin} cases={cases} draft={draft} onSaved={onSaved} />
      )}

      {saved && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertTitle>Saved to case history</AlertTitle>
          <AlertDescription className="text-foreground">
            Added to &ldquo;{saved.caseSubject}&rdquo;.{" "}
            <a
              href={`#note-${saved.noteId}`}
              onClick={(event) => {
                event.preventDefault();
                flashWhenPresent(`note-${saved.noteId}`);
              }}
              className="font-medium underline underline-offset-2"
            >
              Show in Case history
            </a>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && (
        <Button variant="outline" size="sm" onClick={reset}>
          {saved ? "Summarize another call" : "Back to transcript"}
        </Button>
      )}
    </div>
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
  onSaved: (saved: Saved) => void;
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

  // A case created by an earlier, half-finished save may not be in the refreshed list yet.
  const options =
    caseId !== "new" && !cases.some((c) => c.id === caseId)
      ? [...cases, { id: caseId, label: `New case · ${subject}`, open: true, subject }]
      : cases;

  function save() {
    setError(null);
    startSaving(async () => {
      let result: SaveNoteResult;
      try {
        result = await saveNoteAction({
          vin,
          caseId,
          newCase: caseId === "new" ? { subject, category } : undefined,
          issue,
          summary,
          nextSteps: nextSteps.split("\n").map((s) => s.trim()).filter(Boolean),
        });
      } catch {
        // Rate limited at the edge, offline, or timed out: the action never answered.
        setError("The save didn't go through. Your edits are still here. Try again in a moment.");
        return;
      }
      if (result.ok) {
        const caseSubject = caseId === "new" ? subject : (options.find((c) => c.id === caseId)?.subject ?? subject);
        onSaved({ noteId: result.noteId, caseSubject });
        return;
      }
      if (result.createdCaseId) setCaseId(result.createdCaseId);
      setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Review the draft</p>

      {draft.callType !== "vehicle_issue" && (
        <Alert variant="warning" role="status">
          <TriangleAlert aria-hidden />
          <AlertTitle>{callTypeWarning[draft.callType]}</AlertTitle>
          <AlertDescription className="text-foreground">Check the draft against the call before saving it.</AlertDescription>
        </Alert>
      )}

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
          {options.map((c) => (
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
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save to case"}
      </Button>
    </div>
  );
}

// See docs/decisions.md#junk-transcripts
const callTypeWarning: Record<Exclude<CallType, "vehicle_issue">, string> = {
  other: "This call doesn't describe a vehicle issue",
  no_conversation: "This transcript doesn't look like a conversation",
};
