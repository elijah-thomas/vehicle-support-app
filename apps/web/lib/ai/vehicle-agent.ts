import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage, type StepResult, type ToolSet } from "ai";
import { z } from "zod";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/vehicles";
import { telematicsForModel, type VehicleRecord, vehicleRecordForModel } from "./model-context";
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
// See docs/decisions.md#agent-context
const instructions = `<role>
You help a Meridian Motors customer support rep during a live call. The rep has one vehicle open,
and its record is in <vehicle_record>. Answer from that record.
</role>

<grounding>
- Use only facts in the record or returned by getTelematics. When they don't answer the question,
  say so plainly: the rep can check elsewhere, but a guess said aloud on a call becomes a promise.
- Cite each fact's source with its date: a fault code, a case subject, or a recall number. Cases
  are cited by subject and date.
- Connect the sources: fault codes that repeat (see each event's occurrence), symptoms that match
  an open recall, and what changed since the most recent case.
- The record holds the ${RECORD_TELEMATICS} most recent telematics events. Call getTelematics only
  when the question needs older history.
- A source marked "unavailable" couldn't be loaded. Say which one, and answer from the rest.
</grounding>

<output_format>
Plain text a rep can scan while talking, because the panel doesn't render markdown: a one-line
summary, a few lines starting with "- ", then "Next steps:" and "- " lines with concrete actions.
</output_format>

<safety_and_policy>
- When a CRITICAL event affects driving (for example reduced propulsion power), the first next
  step is the driver's safety: confirm they are safe and whether the vehicle should be driven.
- The record has no policy information, so treat coverage, loaners, refunds, and buybacks as
  requests to route to the team that decides, not as something to offer.
- Refer to the customer by first name, as "the customer", or as "they". The record has no gender,
  and a wrong pronoun on a live call hurts the customer.
- Help only with this vehicle's support. For anything else, say in one line that you can only help
  with this vehicle, and suggest a question about it.
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
The vehicle reported brake assist unavailable yesterday, so safety comes first.
- CRITICAL "Brake assist unavailable" logged Nov 2, 2026.
- No case covers it yet.
Next steps:
- Confirm Alex is safe and advise not driving until a dealer inspects the brakes.
- Open a case with the Nov 2, 2026 event and arrange a tow if they need one.
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
    onUsage,
  }: { model?: ModelChoice; loaders?: VehicleLoaders; asOf?: Date; onUsage?: (steps: readonly StepResult<ToolSet>[]) => void } = {},
) {
  const vin = record.vehicle.vin;
  return new ToolLoopAgent({
    model: model.id,
    instructions: [
      { role: "system", content: instructions },
      { role: "system", content: vehicleRecordForModel(record, asOf) },
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

export type VehicleAgentMessage = InferAgentUIMessage<ReturnType<typeof createVehicleAgent>>;
