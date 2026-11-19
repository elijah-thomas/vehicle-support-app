import "server-only";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

// Decision (D15): Claude on Anthropic first, then Gemini on Vertex, both BYOK, for the assistant
// and call summaries. Why: Claude started within 1.2 s every time; Gemini stalled up to 36 s, and
// two vendors on two clouds keep a working path. Trade-off: about 3× the model cost. The only
// place model IDs live. See docs/decisions.md#models
//
//   Claude Sonnet 5.5 on Anthropic → billed to Anthropic org credits (BYOK)
//   Gemini 3.8 Flash on Vertex     → billed to GCP credits (BYOK)
//   Vercel's own provider keys     → automatic AI Gateway retry if a BYOK key fails
const GEMINI = "google/gemini-3.8-flash";
const CLAUDE = "anthropic/claude-sonnet-5.5";
// Hard filter: Gemini only via Vertex, Claude only via Anthropic.
const only = ["vertex", "anthropic"];

export type ModelChoice = { id: string; gateway: Pick<GatewayProviderOptions, "models" | "only"> };

export const defaultModel: ModelChoice = { id: CLAUDE, gateway: { models: [GEMINI], only } };

// Each model alone, with no fallback, so an eval score belongs to the model it names.
export const evalModels = {
  gemini: { id: GEMINI, gateway: { only: ["vertex"] } },
  claude: { id: CLAUDE, gateway: { only: ["anthropic"] } },
} satisfies Record<string, ModelChoice>;

// "agent-eve" is the Eve version of the assistant (D28), tagged apart so the two can be compared.
export type AiFeature = "agent" | "agent-eve" | "call-summary";

// Per-feature gateway options: cache the static prefix (Anthropic needs this; Gemini caches on its
// own) and tag requests so spend and latency can be split by feature in AI Gateway.
export function gatewayOptionsFor(model: ModelChoice, feature: AiFeature) {
  return { ...model.gateway, caching: "auto" as const, tags: [`feature:${feature}`] };
}
