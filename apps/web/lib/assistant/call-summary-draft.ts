import { z } from "zod";
import { callSummarySchema, MAX_TRANSCRIPT_LENGTH } from "@/lib/ai/call-summary-schema";

// What the rep has changed in the review form. caseId is null until the rep picks a case, so the
// form keeps choosing its default (D20) from the cases it has now.
const editsSchema = z.object({
  caseId: z.string().nullable(),
  issue: z.string(),
  summary: z.string(),
  nextSteps: z.string(),
  subject: z.string(),
  category: z.string(),
});

const storedSchema = z.object({
  transcript: z.string().max(MAX_TRANSCRIPT_LENGTH),
  // The draft's ID travels with it, so a save after a reload is still recognized as a repeat.
  draft: z.object({ id: z.uuid(), generated: callSummarySchema, edits: editsSchema }).nullable(),
});

export type DraftEdits = z.infer<typeof editsSchema>;
export type StoredCallSummary = z.infer<typeof storedSchema>;
export type ActiveDraft = NonNullable<StoredCallSummary["draft"]>;

// Decision (D14): the unsaved transcript and draft live in sessionStorage, one entry per vehicle.
// Why: a reload keeps them, and closing the tab removes them, so transcripts don't stay on shared
// advisor machines. Trade-off: a browser crash or a second tab starts empty.
// See docs/decisions.md#saving-notes
const key = (vin: string) => `vs:call-summary:${vin}`;

export function loadCallSummary(vin: string): StoredCallSummary | null {
  try {
    const raw = window.sessionStorage.getItem(key(vin));
    const parsed = raw ? storedSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    // Blocked storage or a corrupt entry: start with an empty form.
    return null;
  }
}

export function storeCallSummary(vin: string, value: StoredCallSummary) {
  try {
    if (!value.transcript && !value.draft) window.sessionStorage.removeItem(key(vin));
    else window.sessionStorage.setItem(key(vin), JSON.stringify(value));
  } catch {
    // Storage blocked or full: the form still works, it just won't survive a reload.
  }
}

export function clearCallSummary(vin: string) {
  storeCallSummary(vin, { transcript: "", draft: null });
}

// A new draft gets its ID here, in the browser: a server-made ID would be new on every retry.
export function newDraft(generated: z.infer<typeof callSummarySchema>): ActiveDraft {
  return {
    id: crypto.randomUUID(),
    generated,
    edits: {
      caseId: null,
      issue: generated.issue,
      summary: generated.summary,
      nextSteps: generated.nextSteps.join("\n"),
      subject: generated.suggestedCase.subject,
      category: generated.suggestedCase.category,
    },
  };
}
