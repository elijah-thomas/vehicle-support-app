"use client";

import { useObject } from "@ai-sdk/react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { saveNoteAction, type SaveNoteResult } from "@/app/vehicles/[vin]/save-note-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { caseHref } from "@/lib/cases";
import { formatCaseNumber } from "@/lib/format";
import { type CallSummary as Draft, callSummarySchema, type CallType, MAX_TRANSCRIPT_LENGTH } from "@/lib/ai/call-summary-schema";
import { aiErrorCode, rateLimitAwareFetch, type AiErrorCode } from "@/lib/assistant/ai-request-error";
import { flashWhenPresent } from "@/lib/flash-element";
import { type ActiveDraft, clearCallSummary, type DraftEdits, loadCallSummary, newDraft, storeCallSummary } from "@/lib/assistant/call-summary-draft";

// An open case the note can be saved to (D20), newest first.
export type CaseOption = { id: string; number: number; label: string; subject: string };

type Saved = { noteId: string; caseNumber: number; caseSubject: string };

type Props = {
  // null while the page's params and cases load: the empty form renders disabled as the fallback.
  vin: string | null;
  cases: CaseOption[];
  cannedTranscript?: { label: string; text: string };
};

const subscribeNever = () => () => {};

// Browser storage isn't readable during the server render, so the form mounts again once
// hydrated, starting from this vehicle's unsaved transcript and draft (D14).
export function CallSummaryForm(props: Props) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const vin = hydrated ? props.vin : null;
  return <CallSummaryFormContent key={vin ?? "pending"} {...props} vin={vin} />;
}

// Paste a transcript → the AI draft streams in → the rep edits it, picks a case, and saves.
// Nothing reaches the case system until the rep presses Save. See docs/decisions.md#call-summary
function CallSummaryFormContent({ vin, cases, cannedTranscript }: Props) {
  const [restored] = useState(() => (vin === null ? null : loadCallSummary(vin)));
  const [transcript, setTranscript] = useState(restored?.transcript ?? "");
  const [draft, setDraft] = useState<ActiveDraft | null>(restored?.draft ?? null);
  const [saved, setSaved] = useState<Saved | null>(null);

  // Keep what isn't saved yet, so a reload doesn't lose it. A saved draft is cleared.
  useEffect(() => {
    if (vin === null) return;
    if (saved) clearCallSummary(vin);
    else storeCallSummary(vin, { transcript, draft });
  }, [vin, transcript, draft, saved]);

  // A stream that ends with a draft that doesn't match the schema finishes "successfully" with
  // no object, so that case is tracked here rather than in useObject's error.
  const [incomplete, setIncomplete] = useState(false);
  const { object, submit, isLoading, error } = useObject({
    api: "/api/call-summary",
    schema: callSummarySchema,
    fetch: rateLimitAwareFetch,
    onFinish: ({ object }) => {
      setDraft(object ? newDraft(object) : null);
      setIncomplete(!object);
    },
  });
  const failure: AiErrorCode | null = error ? aiErrorCode(error) : incomplete ? "incomplete" : null;

  function reset() {
    setDraft(null);
    setSaved(null);
  }

  function editDraft(change: Partial<DraftEdits>) {
    setDraft((current) => current && { ...current, edits: { ...current.edits, ...change } });
  }

  function onSaved(result: Saved) {
    setSaved(result);
    flashWhenPresent(`note-${result.noteId}`);
  }

  function generate() {
    setDraft(null);
    setSaved(null);
    setIncomplete(false);
    submit({ vin, transcript });
  }

  const drafting = isLoading || draft !== null || saved !== null;

  if (!drafting || vin === null) {
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
          disabled={vin === null}
        />
        {failure && (
          <Alert variant={failure === "rate_limited" ? "warning" : "destructive"} role="alert">
            <AlertDescription className="text-foreground">{draftErrorCopy[failure]}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={vin === null || !transcript.trim()}>
            Summarize call
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
        <ReviewForm vin={vin} cases={cases} draft={draft} onEdit={editDraft} onSaved={onSaved} />
      )}

      {saved && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertTitle>Saved to {formatCaseNumber(saved.caseNumber)}</AlertTitle>
          <AlertDescription className="text-foreground">
            Added to &ldquo;{saved.caseSubject}&rdquo;.{" "}
            <Link
              href={`${caseHref(vin, saved.caseNumber)}#note-${saved.noteId}`}
              className="font-medium underline underline-offset-2"
            >
              Open the case
            </Link>
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

// The rep's edits live in the parent's draft, so they're stored with it and survive a reload.
function ReviewForm({
  vin,
  cases,
  draft,
  onEdit,
  onSaved,
}: {
  vin: string;
  cases: CaseOption[];
  draft: ActiveDraft;
  onEdit: (change: Partial<DraftEdits>) => void;
  onSaved: (saved: Saved) => void;
}) {
  const { issue, summary, nextSteps, subject, category } = draft.edits;
  // The case in view if it's open, else the newest open case, else a new case, until the rep picks
  // one. A restored pick that's no longer open falls back the same way.
  // See docs/decisions.md#call-summary
  const params = useParams<{ number?: string }>();
  const defaultCase = cases.find((c) => String(c.number) === params.number) ?? cases[0];
  const pick = draft.edits.caseId;
  const stillOpen = pick !== null && (pick === "new" || cases.some((c) => c.id === pick));
  const caseId = stillOpen ? pick : (defaultCase?.id ?? "new");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const picked = cases.find((c) => c.id === caseId);

  function save() {
    setError(null);
    startSaving(async () => {
      let result: SaveNoteResult;
      try {
        result = await saveNoteAction({
          vin,
          draftId: draft.id,
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
        const caseNumber = result.caseNumber ?? picked?.number;
        if (caseNumber === undefined) {
          setError("Saved, but the case couldn't be found. Reload the page.");
          return;
        }
        onSaved({ noteId: result.noteId, caseNumber, caseSubject: picked?.subject ?? subject });
        return;
      }
      setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Review the draft</p>

      {draft.generated.callType !== "vehicle_issue" && (
        <Alert variant="warning" role="status">
          <TriangleAlert aria-hidden />
          <AlertTitle>{callTypeWarning[draft.generated.callType]}</AlertTitle>
          <AlertDescription className="text-foreground">Check the draft against the call before saving it.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="issue">Issue</Label>
        <Input id="issue" value={issue} onChange={(e) => onEdit({ issue: e.target.value })} maxLength={300} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" value={summary} onChange={(e) => onEdit({ summary: e.target.value })} rows={4} maxLength={4000} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="next-steps">Next steps (one per line)</Label>
        <Textarea id="next-steps" value={nextSteps} onChange={(e) => onEdit({ nextSteps: e.target.value })} rows={4} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="case">Save to</Label>
        <select
          id="case"
          value={caseId}
          onChange={(e) => onEdit({ caseId: e.target.value })}
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
            <Input id="subject" value={subject} onChange={(e) => onEdit({ subject: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={category} onChange={(e) => onEdit({ category: e.target.value })} maxLength={100} />
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
        {saving ? "Saving…" : picked ? `Save to ${formatCaseNumber(picked.number)}` : "Save to new case"}
      </Button>
    </div>
  );
}

// See docs/decisions.md#call-summary
const callTypeWarning: Record<Exclude<CallType, "vehicle_issue">, string> = {
  other: "This call doesn't describe a vehicle issue",
  no_conversation: "Nothing to summarize from this call",
};

const draftErrorCopy: Record<AiErrorCode, string> = {
  rate_limited: "Too many requests. Wait a minute, then draft again.",
  too_long: "The transcript is too long. Keep it under 15,000 characters.",
  invalid_request: "The transcript couldn't be sent. Check that it isn't empty.",
  not_found: "This vehicle isn't in the vehicle data service anymore. Reload the page.",
  incomplete: "The draft came back incomplete. Your transcript is still here. Try again.",
  failed: "Couldn't draft a summary. Your transcript is still here. Try again in a moment.",
};
