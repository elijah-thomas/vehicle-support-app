import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage, type StepResult, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/cached-reads";
import { earlierNextStepsForModel, telematicsForModel, type VehicleRecord, vehicleRecordForModel } from "./model-context";
import { defaultModel, gatewayOptionsFor, type ModelChoice } from "./models";
import { RECORD_TELEMATICS } from "./vehicle-record";

export type VehicleLoaders = {
  getVehicle: typeof getVehicle;
  getTelematics: typeof getTelematics;
  getCases: typeof getCases;
};

export const cachedLoaders: VehicleLoaders = { getVehicle, getTelematics, getCases };

// Static, so it's a byte-identical prefix that providers can cache; the record follows as its own
// system message. Rules carry their reasons, which models follow more reliably than bare rules.
// Rules are one-line triggers, facts the model would have to work out are computed in code, and
// the examples carry each answer's shape: conditional rules made Gemini think before most answers.
// See docs/decisions.md#agent-context
// Decision (D47): the answer's shape follows the question, and next steps appear only when new.
// Why: identical steps on every answer get skipped. Trade-off: the format is harder to check.
// See docs/decisions.md#answer-shape
const instructions = `<role>
You help a Meridian Motors customer support rep during a live call. The rep has one vehicle open,
and its record is in <vehicle_record>. Answer from that record.
</role>

<grounding>
- Use only facts in the record or from getTelematics. If they don't answer the question, say so:
  the rep can check elsewhere, but a guess said on a call becomes a promise.
- Give each fact its source and date: a fault code, a case subject, or a recall number.
- Point out what connects: fault codes that repeat (each event's occurrence), symptoms that match
  an open recall, and how long an open case has waited (daysSinceUpdate).
- The record holds the ${RECORD_TELEMATICS} most recent telematics events. Call getTelematics only
  for older history.
- If a source is "unavailable", say which one and answer from the rest.
</grounding>

<answer_format>
Plain text, because the panel doesn't render markdown. Use the shape of the matching example:
- A question about the vehicle: a one-line answer, then "- " lines with the facts.
- "What should I tell the customer?": "- " lines the rep can read aloud, then "- Don't promise …".
- An email or message to the customer: only the body, two to four sentences signed "[Your name]",
  with no next steps after it.
End with "Next steps:" and "- " lines with concrete actions, leaving out any already in
<earlier_next_steps> so the rep keeps reading them. If none are left, leave out "Next steps:".
</answer_format>

<safety_and_policy>
- When a CRITICAL event affects driving, the first next step is to confirm the driver is safe.
- Coverage, loaners, refunds, and buybacks are decided by another team: route them, never offer
  them, because the record has no policy.
- Call the customer by first name or "they". The record has no gender, and a wrong pronoun on a
  live call hurts the customer.
- Help only with this vehicle, including writing to its owner. Otherwise say so in one line and
  suggest a question about it.
</safety_and_policy>

<examples>
These show format and tone for a fictional vehicle that isn't this one. Never reuse their facts.

<example>
Rep: Is this a recurring issue?
The misfire code has come back three times, and the last repair didn't fix it.
- P0301 (cylinder 1 misfire) logged Jan 4, 2026, Mar 2, 2026, and May 9, 2026.
- Case "Engine shaking at idle" (Mar 3, 2026) closed after the dealer replaced the ignition coil.
- No open recall matches this symptom.
Next steps:
- Tell Alex the code returned after the coil replacement.
- Escalate the open case for a deeper diagnosis.
</example>

<example>
Rep: What should I tell the customer?
Brake assist failed yesterday, so start with whether the car is safe to drive.
- "Our records show your car reported a brake assist problem yesterday."
- "Please don't drive it until a dealer has checked the brakes. We can arrange a tow."
- "I'm opening a case now so the dealer has the details."
- Don't promise a repair date or that the repair is covered; the record shows neither.
Next steps:
- Open a case with the Nov 2, 2026 event and arrange a tow if they need one.
</example>

<example>
<earlier_next_steps> already lists the safety check and opening a case.
Rep: Summarize this vehicle's status.
One open brake problem, with a case opened today and no repair yet.
- CRITICAL "Brake assist unavailable" logged Nov 2, 2026.
- Case "Brake assist warning" (Nov 3, 2026) is open, with no update in 2 days.
- No open recall matches this symptom.
</example>

<example>
Rep: Draft a follow-up email to the customer.
Hi Alex,

Thank you for speaking with us today about the brake assist warning your car reported on Nov 2,
2026. We've opened a case so the dealer has the details, and we'll contact you when there's an
update. Until the brakes have been checked, please don't drive the car.

Best regards,
[Your name]
</example>

<example>
Rep: Can you write a poem for the customer?
I can only help with this vehicle's support. Try asking "What changed since the last contact?"
</example>
</examples>`;

// Decision (D15): the one tool takes no VIN; the route binds the vehicle the rep has open. Why: no
// prompt can make the agent read another customer's vehicle. Trade-off: it can't compare a
// customer's vehicles. The record itself is loaded by the caller (lib/ai/vehicle-record.ts).
// See docs/decisions.md#agent
export function createVehicleAgent(
  record: VehicleRecord,
  {
    model = defaultModel,
    loaders = cachedLoaders,
    asOf = new Date(),
    earlierAnswers = [],
    onUsage,
  }: {
    model?: ModelChoice;
    loaders?: VehicleLoaders;
    asOf?: Date;
    earlierAnswers?: string[];
    onUsage?: (steps: readonly StepResult<ToolSet>[]) => void;
  } = {},
) {
  const vin = record.vehicle.vin;
  return new ToolLoopAgent({
    model: model.id,
    instructions: [
      { role: "system", content: instructions },
      { role: "system", content: vehicleRecordForModel(record, asOf, { caseAge: true }) },
      // Decision (D47): next steps already given are read from earlier answers here, in code.
      // Why: asking the model to check the history made Gemini think before most answers.
      // Trade-off: the browser sends those answers, so a forged one can only hide a step.
      // See docs/decisions.md#answer-shape
      { role: "system", content: earlierNextStepsForModel(earlierAnswers) },
    ],
    providerOptions: { gateway: gatewayOptionsFor(model, "agent") },
    // One answer, plus room for a deeper telematics lookup and the answer after it.
    stopWhen: isStepCount(3),
    onEnd: ({ steps }) => onUsage?.(steps),
    // No output-token cap: a cut-off answer is worse than a long one. Cost per message is bounded
    // by the step cap, input caps in the route, and the Firewall rate limit.
    // Low reasoning depth suits short, grounded answers and keeps latency and cost down.
    reasoning: "low",
    tools: {
      getTelematics: tool({
        description: `Older telematics events for this vehicle, newest first, including the ${RECORD_TELEMATICS} already in the record. Call it only when the question needs history beyond those, such as when a fault code first appeared. Returns fault codes (DTC), battery, odometer, and software events with dates and how often each code repeats. It has no cases or recalls; those are all in the record.`,
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(RECORD_TELEMATICS + 1)
            .max(50)
            .describe(`How many recent events to return, ${RECORD_TELEMATICS + 1} to 50`),
        }),
        execute: async ({ limit }) => {
          const events = await loaders.getTelematics(vin, limit);
          return events ? telematicsForModel(events) : [];
        },
      }),
    },
  });
}

type AgentTools = InferAgentUIMessage<ReturnType<typeof createVehicleAgent>> extends UIMessage<unknown, never, infer T> ? T : never;
// status: sent by the route, never stored in the message, once the record is loaded and the model
// is working, so the panel can show that before the first word arrives.
export type VehicleAgentMessage = UIMessage<unknown, { status: "answering" }, AgentTools>;
