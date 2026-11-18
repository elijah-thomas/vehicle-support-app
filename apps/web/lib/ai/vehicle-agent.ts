import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage, type StepResult, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/vehicles";
import { earlierNextStepsForModel, telematicsForModel, type VehicleRecord, vehicleRecordForModel } from "./model-context";
import { defaultModel, gatewayOptionsFor, type ModelChoice } from "./models";
import { RECORD_TELEMATICS } from "./vehicle-record";
import { instructions } from "./vehicle-agent-instructions";

export type VehicleLoaders = {
  getVehicle: typeof getVehicle;
  getTelematics: typeof getTelematics;
  getCases: typeof getCases;
};

export const cachedLoaders: VehicleLoaders = { getVehicle, getTelematics, getCases };

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
