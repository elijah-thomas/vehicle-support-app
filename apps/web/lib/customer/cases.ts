import "server-only";
import { z } from "zod";
import { vehicleApi } from "./vehicle-api";

const createdSchema = z.object({ id: z.string() });

type NoteInput = { source: "REP" | "AI_DRAFT_EDITED"; issue: string; summary: string; nextSteps: string[] };

const createdWithNoteSchema = z.object({ id: z.string(), notes: z.array(z.object({ id: z.string() })).length(1) });

// The case and its first note are written in one call, so a failure can't leave an empty case.
export async function createCaseWithNote(input: {
  vin: string;
  category: string;
  subject: string;
  description: string;
  note: NoteInput;
}) {
  const created = await vehicleApi("/cases", createdWithNoteSchema, { method: "POST", body: JSON.stringify(input) });
  return { caseId: created.id, noteId: created.notes[0]!.id };
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
