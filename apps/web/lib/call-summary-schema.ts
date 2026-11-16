import { z } from "zod";

// Shared by the server (what the model must return) and the client (what streams into the form).
// Fields match the GCP case_notes table. Length limits are stated, not enforced: a draft one
// character over would fail validation and vanish, and the rep edits it before saving anyway.
export const callSummarySchema = z.object({
  callType: z
    .enum(["vehicle_issue", "other", "no_conversation"])
    .describe(
      "vehicle_issue: the customer describes a problem or question about the vehicle. other: a real conversation about something else. no_conversation: no real conversation took place (silence, a dropped call, noise, or text that isn't a call)",
    ),
  issue: z.string().describe("What the customer called about, in one short line (under 300 characters)"),
  summary: z.string().describe("What was said on the call, in 2 to 4 plain sentences"),
  nextSteps: z
    .array(z.string())
    .describe("1 to 6 concrete actions for the rep, most important first, each under 500 characters"),
  suggestedCase: z
    .object({
      subject: z.string().describe("Short case subject, used only if the rep opens a new case"),
      category: z.string().describe("Case category, e.g. Electrical, Battery & Charging, Engine & Emissions"),
    })
    .describe("Used only if the rep files this call under a new case"),
});

export type CallSummary = z.infer<typeof callSummarySchema>;
export type CallType = CallSummary["callType"];

export const MAX_TRANSCRIPT_LENGTH = 15_000;
