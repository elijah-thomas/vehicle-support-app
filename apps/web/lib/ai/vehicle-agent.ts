import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/vehicles";
import { casesForModel, telematicsForModel } from "./model-context";
import { defaultModel, type ModelChoice } from "./models";

export type VehicleLoaders = {
  getVehicle: typeof getVehicle;
  getTelematics: typeof getTelematics;
  getCases: typeof getCases;
};

const cachedLoaders: VehicleLoaders = { getVehicle, getTelematics, getCases };

const instructions = `You help a customer support rep at Meridian Motors on a live call.
The rep has one vehicle open. Use the tools to look at its record before answering.

Rules:
- State only facts the tools returned. If the data doesn't answer the question, say so. Never guess.
- Cite where each fact comes from, with dates: a telematics code, a case subject, or a recall number.
  Refer to cases by subject and date, never by internal ID. Write dates like "Nov 9, 2026" (UTC).
- Connect the dots across sources: repeated fault codes, symptoms that match an open recall,
  what changed since the most recent case.
- Keep answers short: a one-line summary, then a few bullet lines starting with "- ".
- End with "Next steps:" and concrete actions for the rep.
- If a CRITICAL event affects driving (for example reduced propulsion power), the first next step
  is the driver's safety: confirm they are safe and whether the vehicle should be driven.
- The record has no policy information. If the customer asks for coverage, a loaner, a refund,
  or a buyback, route the request to the team that decides; never promise one.
- Refer to the customer by name, as "the customer", or as "they". Never guess pronouns.
- Plain text only. No markdown headings, bold, or tables.`;

// Tools take no VIN: the route passes the vehicle the rep has open, so no prompt can make the
// agent read another customer's record. See docs/decisions.md#agent
// Evals pass a single model and uncached loaders; the route uses the defaults.
export function createVehicleAgent(
  vin: string,
  { model = defaultModel, loaders = cachedLoaders }: { model?: ModelChoice; loaders?: VehicleLoaders } = {},
) {
  return new ToolLoopAgent({
    model: model.id,
    instructions,
    providerOptions: { gateway: model.gateway },
    stopWhen: isStepCount(6),
    // No output-token cap: a cut-off answer is worse than a long one. Cost per message is bounded
    // by the step cap, input caps in the route, and the Firewall rate limit.
    // Low reasoning depth suits short, grounded answers and keeps latency and cost down.
    reasoning: "low",
    tools: {
      getVehicle: tool({
        description: "Vehicle details, owner, factory specs, installed options, and recalls with their status.",
        inputSchema: z.object({}),
        execute: () => loaders.getVehicle(vin),
      }),
      getTelematics: tool({
        description: "Recent telematics events, newest first: fault codes (DTC), battery, odometer, software.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).default(20).describe("How many recent events to return"),
        }),
        execute: async ({ limit }) => telematicsForModel(await loaders.getTelematics(vin, limit)),
      }),
      getCases: tool({
        description: "Support cases for this vehicle, newest first, with resolutions and saved call notes.",
        inputSchema: z.object({}),
        execute: async () => casesForModel(await loaders.getCases(vin)),
      }),
    },
  });
}

export type VehicleAgentMessage = InferAgentUIMessage<ReturnType<typeof createVehicleAgent>>;
