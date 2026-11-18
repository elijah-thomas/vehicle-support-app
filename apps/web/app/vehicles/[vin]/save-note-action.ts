"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import { addCaseNote, createCaseWithNote } from "@/lib/customer/writes";
import { VehicleApiError } from "@/lib/customer/vehicle-api";
import { VIN_PATTERN } from "@/lib/format";

// Limits match the GCP API's validation, so the rep gets a clear error here rather than a 400 there.
// Each message names the field, so the rep knows what to fix in the form.
const text = (field: string, max: number) =>
  z.string().trim().min(1, `${field} can't be empty`).max(max, `${field} is too long: ${max} characters max`);

const saveSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN, "This page's VIN isn't valid"),
  draftId: z.uuid("This draft is missing its ID. Summarize the call again."),
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
  // caseNumber comes back for a new case; for an existing one the form already knows it.
  | { ok: true; noteId: string; caseId: string; caseNumber?: number }
  | { ok: false; error: string };

function saveError(error: unknown) {
  if (!(error instanceof VehicleApiError)) return "Couldn't reach the case system. Try again in a moment.";
  if (error.status === 409) return "This draft is already saved to another case. Find it in Case history.";
  if (error.status === 404) return "That case isn't on this vehicle in the case system. Pick another case or New case.";
  if (error.status === 400) return `The case system didn't accept the note: ${error.message}`;
  if (error.status === 429) return "The case system is busy. Wait a minute, then save again.";
  return "The case system didn't respond. Try again in a moment.";
}

export async function saveNoteAction(input: z.input<typeof saveSchema>): Promise<SaveNoteResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const { vin, draftId, caseId, newCase, issue, summary, nextSteps } = parsed.data;

  // A retry sends the same draftId, so the case system answers with the first save instead of
  // writing it again (D14). See docs/decisions.md#saving-notes
  const note = { source: "AI_DRAFT_EDITED" as const, draftId, issue, summary, nextSteps };
  if (caseId === "new" && !newCase) return { ok: false, error: "A new case needs a subject and category" };

  try {
    const saved =
      caseId === "new"
        ? await createCaseWithNote({ vin, ...newCase!, description: summary, note })
        : { caseId, noteId: (await addCaseNote(caseId, { vin, ...note })).id };
    // Decision (D7): updateTag gives read-your-own-writes: the next render waits for fresh cases
    // instead of serving the cached list. See docs/decisions.md#caching
    updateTag(cacheTags.cases(vin));
    return { ok: true, ...saved };
  } catch (error) {
    // Already saved elsewhere: refresh Case history so the rep can find it there.
    if (error instanceof VehicleApiError && error.status === 409) updateTag(cacheTags.cases(vin));
    return { ok: false, error: saveError(error) };
  }
}
