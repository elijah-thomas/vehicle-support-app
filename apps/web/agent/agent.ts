import { defineAgent } from "eve";
import { defaultModel, gatewayOptionsFor } from "@/lib/ai/models";

// Eve types provider options as plain JSON. Ours are strings and arrays of strings, so the
// round-trip is lossless.
const gateway = JSON.parse(JSON.stringify(gatewayOptionsFor(defaultModel, "agent-eve")));

// A conversation stops starting model calls past these totals, about 30 answers. Counted in tokens
// because Eve's cost is what AI Gateway bills, which is $0 on Meridian's own keys (D15).
const MAX_CONVERSATION_OUTPUT_TOKENS = 15_000;
const MAX_CONVERSATION_NEW_INPUT_TOKENS = 100_000;

export default defineAgent({
  model: defaultModel.id,
  modelOptions: { providerOptions: { gateway } },
  reasoning: "low",
  // Decision (D28): only the tool in agent/tools. Eve gives every agent bash, file, web and
  // subagent tools by default; this assistant only reads one vehicle's record (D16).
  // See docs/decisions.md#eve-assistant
  defaultTools: false,
  limits: {
    sessionUsage: ({ total }) =>
      total.outputTokens >= MAX_CONVERSATION_OUTPUT_TOKENS ||
      total.inputTokens - total.cacheReadTokens >= MAX_CONVERSATION_NEW_INPUT_TOKENS,
    // Decision (D28): a conversation closes after a day without questions, not Eve's 30 days.
    // Why: the tab that holds its ID is gone by then, and a day still covers a next-day callback.
    // Trade-off: a tab left open longer starts over. See docs/decisions.md#eve-assistant
    sessionTimeoutMs: 24 * 60 * 60 * 1000,
  },
});
