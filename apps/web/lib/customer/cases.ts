import "server-only";
import { z } from "zod";
import { vehicleApi } from "./vehicle-api";

const createdSchema = z.object({ id: z.string() });

// A rep's note may have only a summary; an AI-drafted note always has all three fields.
type NoteInput =
  | { source: "REP"; issue?: string; summary: string; nextSteps?: string[] }
  // draftId lets the case system refuse a repeat of the same save (D46).
  | { source: "AI_DRAFT_EDITED"; draftId: string; issue: string; summary: string; nextSteps: string[] };

const createdWithNoteSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  notes: z.array(z.object({ id: z.string() })).length(1),
});

// The case and its first note are written in one call, so a failure can't leave an empty case.
export async function createCaseWithNote(input: {
  vin: string;
  category: string;
  subject: string;
  description: string;
  note: NoteInput;
}) {
  const created = await vehicleApi("/cases", createdWithNoteSchema, { method: "POST", body: JSON.stringify(input) });
  return { caseId: created.id, caseNumber: created.number, noteId: created.notes[0]!.id };
}

// The VIN lets the case system refuse a note for a case that isn't this vehicle's.
// See docs/decisions.md#note-ownership
export function addCaseNote(caseId: string, note: NoteInput & { vin: string }) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/notes`, createdSchema, {
    method: "POST",
    body: JSON.stringify(note),
  });
}

export function closeCase(caseId: string, input: { vin: string; resolution: string }) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/close`, createdSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reopenCase(caseId: string, input: { vin: string; reason: string }) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/reopen`, createdSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Removing marks the note; restore (Undo) clears the mark. Both name the vehicle, as notes do.
export function removeNote(caseId: string, noteId: string, vin: string) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/notes/${encodeURIComponent(noteId)}/remove`, createdSchema, {
    method: "POST",
    body: JSON.stringify({ vin }),
  });
}

export function restoreNote(caseId: string, noteId: string, vin: string) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/notes/${encodeURIComponent(noteId)}/restore`, createdSchema, {
    method: "POST",
    body: JSON.stringify({ vin }),
  });
}
