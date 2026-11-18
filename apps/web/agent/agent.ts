import { defineAgent } from "eve";
import { defaultModel, gatewayOptionsFor } from "@/lib/ai/models";

// Eve types provider options as plain JSON; the AI SDK's gateway type also allows conditional
// fallbacks (objects with functions). Ours are strings, so a JSON round-trip is lossless.
const gateway = JSON.parse(JSON.stringify(gatewayOptionsFor(defaultModel, "agent")));

export default defineAgent({
  model: defaultModel.id,
  modelOptions: { providerOptions: { gateway } },
  reasoning: "low",
  // Only the tools in agent/tools: no bash, files, web fetch or subagents.
  defaultTools: false,
});
