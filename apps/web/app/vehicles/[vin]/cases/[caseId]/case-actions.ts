"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import { addCaseNote, closeCase } from "@/lib/customer/cases";
import { VehicleApiError } from "@/lib/customer/vehicle-api";
import { VIN_PATTERN } from "@/lib/format";

// Limits match the GCP API's validation, so the rep gets a clear error here rather than a 400 there.
const text = (field: string, max: number) =>
  z.string().trim().min(1, `${field} can't be empty`).max(max, `${field} is too long: ${max} characters max`);

const target = {
  vin: z.string().toUpperCase().regex(VIN_PATTERN, "This page's VIN isn't valid"),
  caseId: z.string().min(1),
};

const noteSchema = z.object({
  ...target,
  issue: text("Issue", 300),
  summary: text("Summary", 4000),
  nextSteps: z
    .array(text("Each next step", 500))
    .min(1, "Add at least one next step")
    .max(10, "Keep it to 10 next steps or fewer"),
});

const closeSchema = z.object({ ...target, resolution: text("Resolution", 1000) });

export type CaseActionResult = { ok: true } | { ok: false; error: string };

function caseSystemError(error: unknown, conflict: string) {
  if (!(error instanceof VehicleApiError)) return "Couldn't reach the case system. Try again in a moment.";
  if (error.status === 404) return "This case isn't on this vehicle in the case system. Reload the page.";
  if (error.status === 409) return conflict;
  if (error.status === 400) return `The case system didn't accept it: ${error.message}`;
  if (error.status === 429) return "The case system is busy. Wait a minute, then try again.";
  return "The case system didn't respond. Try again in a moment.";
}

// Both actions clear the vehicle's cached case list, so the case view and the vehicle page show
// the change on the next render. See docs/decisions.md#case-view
export async function addRepNoteAction(input: z.input<typeof noteSchema>): Promise<CaseActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const { vin, caseId, ...note } = parsed.data;

  try {
    await addCaseNote(caseId, { vin, source: "REP", ...note });
  } catch (error) {
    return { ok: false, error: caseSystemError(error, "The case system refused the note.") };
  }
  updateTag(cacheTags.cases(vin));
  return { ok: true };
}

export async function closeCaseAction(input: z.input<typeof closeSchema>): Promise<CaseActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid resolution" };
  const { vin, caseId, resolution } = parsed.data;

  try {
    await closeCase(caseId, { vin, resolution });
  } catch (error) {
    // Closed elsewhere since the page loaded: refresh so the page shows it.
    if (error instanceof VehicleApiError && error.status === 409) updateTag(cacheTags.cases(vin));
    return { ok: false, error: caseSystemError(error, "This case was already closed. The page now shows its resolution.") };
  }
  updateTag(cacheTags.cases(vin));
  return { ok: true };
}
