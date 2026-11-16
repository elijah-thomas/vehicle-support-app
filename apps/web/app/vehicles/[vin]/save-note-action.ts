"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import { addCaseNote, createCase } from "@/lib/customer/cases";
import { VehicleApiError } from "@/lib/customer/vehicle-api";
import { VIN_PATTERN } from "@/lib/format";

// Limits match the GCP API's validation, so the rep gets a clear error here rather than a 400 there.
const saveSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN),
  caseId: z.string().min(1), // an existing case ID, or "new"
  newCase: z.object({ subject: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(100) }).optional(),
  issue: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(4000),
  nextSteps: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});

export type SaveNoteResult =
  | { ok: true; noteId: string }
  // createdCaseId: the new case was created but the note wasn't, so a retry must add to that case.
  | { ok: false; error: string; createdCaseId?: string };

function saveError(error: unknown) {
  if (!(error instanceof VehicleApiError)) return "Couldn't reach the case system. Try again in a moment.";
  if (error.status === 404) return "That case no longer exists in the case system. Pick another case or New case.";
  if (error.status === 400) return `The case system didn't accept the note: ${error.message}`;
  if (error.status === 429) return "The case system is busy. Wait a minute, then save again.";
  return "The case system didn't respond. Try again in a moment.";
}

export async function saveNoteAction(input: z.input<typeof saveSchema>): Promise<SaveNoteResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const { vin, caseId, newCase, issue, summary, nextSteps } = parsed.data;

  let targetCaseId = caseId;
  if (caseId === "new") {
    if (!newCase) return { ok: false, error: "A new case needs a subject and category" };
    try {
      targetCaseId = (await createCase({ vin, ...newCase, description: summary })).id;
    } catch (error) {
      return { ok: false, error: saveError(error) };
    }
  }

  // Read-your-own-writes: the next render waits for fresh cases instead of serving the cached list.
  // See docs/decisions.md#vehicle-page-caching
  try {
    const note = await addCaseNote(targetCaseId, { source: "AI_DRAFT_EDITED", issue, summary, nextSteps });
    updateTag(cacheTags.cases(vin));
    return { ok: true, noteId: note.id };
  } catch (error) {
    if (caseId !== "new") return { ok: false, error: saveError(error) };
    // The case exists now, so show it in the picker and let the retry add only the note.
    // See docs/decisions.md#save-feedback
    updateTag(cacheTags.cases(vin));
    return {
      ok: false,
      createdCaseId: targetCaseId,
      error: `The new case was created, but the note wasn't saved. ${saveError(error)}`,
    };
  }
}
