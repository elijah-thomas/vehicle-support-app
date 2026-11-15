import "server-only";
import { z } from "zod";
import { vehicleApi } from "./vehicle-api";

const createdSchema = z.object({ id: z.string() });

export function createCase(input: { vin: string; category: string; subject: string; description: string }) {
  return vehicleApi("/cases", createdSchema, { method: "POST", body: JSON.stringify(input) });
}

export function addCaseNote(
  caseId: string,
  note: { source: "REP" | "AI_DRAFT_EDITED"; issue: string; summary: string; nextSteps: string[] },
) {
  return vehicleApi(`/cases/${encodeURIComponent(caseId)}/notes`, createdSchema, {
    method: "POST",
    body: JSON.stringify(note),
  });
}
