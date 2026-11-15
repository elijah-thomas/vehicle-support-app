import { z } from "zod";

// Shared by the server (what the model must return) and the client (what streams into the form).
// Fields match the GCP case_notes table, with limits matching the API's validation.
export const callSummarySchema = z.object({
  issue: z.string().describe("The customer's issue in one short line"),
  summary: z.string().describe("What happened on the call, in 2 to 4 plain sentences"),
  nextSteps: z
    .array(z.string())
    .describe("1 to 6 concrete actions for the rep to resolve the issue, most important first"),
  suggestedCase: z
    .object({
      subject: z.string().describe("Short case subject, used only if the rep opens a new case"),
      category: z.string().describe("Case category, e.g. Electrical, Battery & Charging, Engine & Emissions"),
    })
    .describe("Used only if the rep files this call under a new case"),
});

export type CallSummary = z.infer<typeof callSummarySchema>;

export const MAX_TRANSCRIPT_LENGTH = 15_000;
