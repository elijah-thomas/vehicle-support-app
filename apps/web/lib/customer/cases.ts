import "server-only";
import { z } from "zod";
import { vehicleApi } from "./vehicle-api";

const createdSchema = z.object({ id: z.string() });

export function createCase(input: { vin: string; category: string; subject: string; description: string }) {
  return vehicleApi("/cases", createdSchema, { method: "POST", body: JSON.stringify(input) });
}

// The VIN lets the case system refuse a note for a case that isn't this vehicle's.
// See docs/decisions.md#note-ownership
export function addCaseNote(
  caseId: string,
  note: { vin: string; source: "REP" | "AI_DRAFT_EDITED"; issue: string; summary: string; nextSteps: string[] },
) {
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
