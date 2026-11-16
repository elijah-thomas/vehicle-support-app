"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import { addCaseNote, createCase } from "@/lib/customer/cases";
import { VehicleApiError } from "@/lib/customer/vehicle-api";
import { VIN_PATTERN } from "@/lib/format";

// Limits match the GCP API's validation, so the rep gets a clear error here rather than a 400 there.
// Each message names the field, so the rep knows what to fix in the form.
const text = (field: string, max: number) =>
  z.string().trim().min(1, `${field} can't be empty`).max(max, `${field} is too long: ${max} characters max`);

const saveSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN, "This page's VIN isn't valid"),
  caseId: z.string().min(1, "Pick a case"), // an existing case ID, or "new"
  newCase: z.object({ subject: text("Case subject", 200), category: text("Category", 100) }).optional(),
  issue: text("Issue", 300),
  summary: text("Summary", 4000),
  nextSteps: z
    .array(text("Each next step", 500))
    .min(1, "Add at least one next step")
    .max(10, "Keep it to 10 next steps or fewer"),
});

export type SaveNoteResult =
  | { ok: true; noteId: string; caseId: string }
  // createdCaseId: the new case was created but the note wasn't, so a retry must add to that case.
  | { ok: false; error: string; createdCaseId?: string };

function saveError(error: unknown) {
  if (!(error instanceof VehicleApiError)) return "Couldn't reach the case system. Try again in a moment.";
  if (error.status === 404) return "That case isn't on this vehicle in the case system. Pick another case or New case.";
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

  // Decision (D24): updateTag gives read-your-own-writes: the next render waits for fresh cases
  // instead of serving the cached list. See docs/decisions.md#vehicle-page-caching
  try {
    const note = await addCaseNote(targetCaseId, { vin, source: "AI_DRAFT_EDITED", issue, summary, nextSteps });
    updateTag(cacheTags.cases(vin));
    return { ok: true, noteId: note.id, caseId: targetCaseId };
  } catch (error) {
    if (caseId !== "new") return { ok: false, error: saveError(error) };
    // Decision (D33): the case exists now, so show it in the picker and let the retry add only the
    // note. Trade-off: the case can be left without a note; a transactional API call is the fix.
    // See docs/decisions.md#save-feedback
    updateTag(cacheTags.cases(vin));
    return {
      ok: false,
      createdCaseId: targetCaseId,
      error: `The new case was created, but the note wasn't saved. ${saveError(error)}`,
    };
  }
}
