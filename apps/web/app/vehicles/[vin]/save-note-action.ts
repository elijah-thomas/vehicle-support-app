"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/customer/cache-tags";
import { addCaseNote, createCase } from "@/lib/customer/cases";
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

export type SaveNoteResult = { ok: true } | { ok: false; error: string };

export async function saveNoteAction(input: z.input<typeof saveSchema>): Promise<SaveNoteResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const { vin, caseId, newCase, issue, summary, nextSteps } = parsed.data;

  try {
    let targetCaseId = caseId;
    if (caseId === "new") {
      if (!newCase) return { ok: false, error: "A new case needs a subject and category" };
      targetCaseId = (await createCase({ vin, ...newCase, description: summary })).id;
    }
    await addCaseNote(targetCaseId, { source: "AI_DRAFT_EDITED", issue, summary, nextSteps });
  } catch {
    return { ok: false, error: "Couldn't save to the case system. Try again." };
  }

  // Read-your-own-writes: the next render waits for fresh cases instead of serving the cached list.
  // See docs/decisions.md#vehicle-page-caching
  updateTag(cacheTags.cases(vin));
  return { ok: true };
}
