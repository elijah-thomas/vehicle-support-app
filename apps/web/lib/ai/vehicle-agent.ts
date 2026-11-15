import "server-only";
import { isStepCount, ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/vehicles";
import { casesForModel, telematicsForModel } from "./model-context";
import { gatewayOptions, PRIMARY_MODEL } from "./models";

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
- Plain text only. No markdown headings, bold, or tables.`;

// Tools take no VIN: the route passes the vehicle the rep has open, so no prompt can make the
// agent read another customer's record. See docs/decisions.md#agent
export function createVehicleAgent(vin: string) {
  return new ToolLoopAgent({
    model: PRIMARY_MODEL,
    instructions,
    providerOptions: { gateway: gatewayOptions },
    stopWhen: isStepCount(6),
    // No output-token cap: a cut-off answer is worse than a long one. Cost per message is bounded
    // by the step cap, input caps in the route, and the Firewall rate limit.
    // Low reasoning depth suits short, grounded answers and keeps latency and cost down.
    reasoning: "low",
    tools: {
      getVehicle: tool({
        description: "Vehicle details, owner, factory specs, installed options, and recalls with their status.",
        inputSchema: z.object({}),
        execute: () => getVehicle(vin),
      }),
      getTelematics: tool({
        description: "Recent telematics events, newest first: fault codes (DTC), battery, odometer, software.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).default(20).describe("How many recent events to return"),
        }),
        execute: async ({ limit }) => telematicsForModel(await getTelematics(vin, limit)),
      }),
      getCases: tool({
        description: "Support cases for this vehicle, newest first, with resolutions and saved call notes.",
        inputSchema: z.object({}),
        execute: async () => casesForModel(await getCases(vin)),
      }),
    },
  });
}

export type VehicleAgentMessage = InferAgentUIMessage<ReturnType<typeof createVehicleAgent>>;
