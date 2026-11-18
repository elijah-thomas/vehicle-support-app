"use server";

import { updateTag } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import {
  addCaseNote,
  closeCase,
  createCaseWithNote,
  removeNote,
  reopenCase,
  restoreNote,
} from "@/lib/customer/writes";
import { VehicleApiError } from "@/lib/customer/vehicle-api";
import { caseHref } from "@/lib/cases";
import { VIN_PATTERN } from "@/lib/format";

// Limits match the GCP API's validation, so the rep gets a clear error here rather than a 400 there.
const text = (field: string, max: number) =>
  z.string().trim().min(1, `${field} can't be empty`).max(max, `${field} is too long: ${max} characters max`);

const target = {
  vin: z.string().toUpperCase().regex(VIN_PATTERN, "This page's VIN isn't valid"),
  caseId: z.string().min(1),
};

// A quick note is only its summary (D40). Transcripts go through Call summary instead.
const noteSchema = z.object({ ...target, summary: text("Note", 4000) });
const closeSchema = z.object({ ...target, resolution: text("Resolution", 1000) });
const reopenSchema = z.object({ ...target, reason: text("Reason", 1000) });
const noteTarget = z.object({ ...target, noteId: z.string().min(1) });

const openCaseSchema = z.object({
  vin: target.vin,
  subject: text("Subject", 200),
  category: text("Category", 100),
  reported: text("What the customer reported", 4000),
});

export type CaseActionResult = { ok: true } | { ok: false; error: string };

function caseSystemError(error: unknown, conflict: string) {
  if (!(error instanceof VehicleApiError)) return "Couldn't reach the case system. Try again in a moment.";
  if (error.status === 404) return "This case isn't on this vehicle in the case system. Reload the page.";
  if (error.status === 409) return conflict;
  if (error.status === 400) return `The case system didn't accept it: ${error.message}`;
  if (error.status === 429) return "The case system is busy. Wait a minute, then try again.";
  return "The case system didn't respond. Try again in a moment.";
}

// Every write clears the vehicle's cached case list, so the case view, the overview and the
// assistant read the change on the next render. See docs/decisions.md#vehicle-routes
async function write(vin: string, call: () => Promise<unknown>, conflict: string): Promise<CaseActionResult> {
  try {
    await call();
  } catch (error) {
    // Changed elsewhere since the page loaded (a 409): refresh so the page shows the current state.
    if (error instanceof VehicleApiError && error.status === 409) updateTag(cacheTags.cases(vin));
    return { ok: false, error: caseSystemError(error, conflict) };
  }
  updateTag(cacheTags.cases(vin));
  return { ok: true };
}

function invalid(error: z.ZodError, fallback: string): CaseActionResult {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

export async function addRepNoteAction(input: z.input<typeof noteSchema>): Promise<CaseActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Invalid note");
  const { vin, caseId, summary } = parsed.data;
  return write(vin, () => addCaseNote(caseId, { vin, source: "REP", summary }), "The case system refused the note.");
}

export async function closeCaseAction(input: z.input<typeof closeSchema>): Promise<CaseActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Invalid resolution");
  const { vin, caseId, resolution } = parsed.data;
  return write(vin, () => closeCase(caseId, { vin, resolution }), "This case was already closed. The page now shows its resolution.");
}

export async function reopenCaseAction(input: z.input<typeof reopenSchema>): Promise<CaseActionResult> {
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Invalid reason");
  const { vin, caseId, reason } = parsed.data;
  return write(vin, () => reopenCase(caseId, { vin, reason }), "This case was already reopened. The page now shows it open.");
}

export async function removeNoteAction(input: z.input<typeof noteTarget>): Promise<CaseActionResult> {
  const parsed = noteTarget.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Invalid note");
  const { vin, caseId, noteId } = parsed.data;
  return write(vin, () => removeNote(caseId, noteId, vin), "This note was already removed.");
}

export async function restoreNoteAction(input: z.input<typeof noteTarget>): Promise<CaseActionResult> {
  const parsed = noteTarget.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Invalid note");
  const { vin, caseId, noteId } = parsed.data;
  return write(vin, () => restoreNote(caseId, noteId, vin), "This note is already back.");
}

// A case always starts with its first note: what the customer reported is the case's description
// and its first rep note, written together in one call (D22). Then the rep lands on the new case.
export async function openCaseAction(input: z.input<typeof openCaseSchema>): Promise<CaseActionResult> {
  const parsed = openCaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid case" };
  const { vin, subject, category, reported } = parsed.data;

  let caseNumber: number;
  try {
    ({ caseNumber } = await createCaseWithNote({
      vin,
      subject,
      category,
      description: reported,
      note: { source: "REP", summary: reported },
    }));
  } catch (error) {
    return { ok: false, error: caseSystemError(error, "The case system refused the case.") };
  }
  updateTag(cacheTags.cases(vin));
  // Replace, not push: browser Back skips the submitted form, matching the breadcrumb trail.
  redirect(caseHref(vin, caseNumber), RedirectType.replace);
}
