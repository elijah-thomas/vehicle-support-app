import "server-only";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

// Decision (D5): Gemini on Vertex and Claude on Anthropic, both BYOK, each the other's fallback.
// Why: two vendors on two clouds, each billed under an existing agreement. Trade-off: answers
// differ by model, so evals run on both. The only place model IDs live. See docs/decisions.md#models
//
//   Gemini 3.8 Flash on Vertex     → billed to GCP credits (BYOK)
//   Claude Sonnet 5.5 on Anthropic → billed to Anthropic org credits (BYOK)
//   Vercel's own provider keys     → automatic AI Gateway retry if a BYOK key fails
const GEMINI = "google/gemini-3.8-flash";
const CLAUDE = "anthropic/claude-sonnet-5.5";
// Hard filter: Gemini only via Vertex, Claude only via Anthropic.
const only = ["vertex", "anthropic"];

export type ModelChoice = { id: string; gateway: Pick<GatewayProviderOptions, "models" | "only"> };

// Decision (D49): the assistant asks Claude first, then Gemini. Why: on a live call the wait for
// the first word matters, and Sonnet started within 1.2 s every time while Gemini stalled up to
// 36 s. Trade-off: about 3.6× the model cost, billed to the Anthropic org. See
// docs/decisions.md#assistant-model
export const agentModel: ModelChoice = { id: CLAUDE, gateway: { models: [GEMINI], only } };

// Call summaries are drafted after the call, so they keep Gemini first (D49).
export const callSummaryModel: ModelChoice = { id: GEMINI, gateway: { models: [CLAUDE], only } };

// Each model alone, with no fallback, so an eval score belongs to the model it names.
export const evalModels = {
  gemini: { id: GEMINI, gateway: { only: ["vertex"] } },
  claude: { id: CLAUDE, gateway: { only: ["anthropic"] } },
} satisfies Record<string, ModelChoice>;

// Per-feature gateway options: cache the static prefix (Anthropic needs this; Gemini caches on its
// own) and tag requests so spend and latency can be split by feature in AI Gateway.
export function gatewayOptionsFor(model: ModelChoice, feature: "agent" | "call-summary") {
  return { ...model.gateway, caching: "auto" as const, tags: [`feature:${feature}`] };
}
