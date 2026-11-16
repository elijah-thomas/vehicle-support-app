import "server-only";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

// The only place model IDs live. See docs/decisions.md#failover-v2
//
//   1. Gemini 3.8 Flash on Vertex    → billed to GCP credits (BYOK)
//   2. Claude Sonnet 5.5 on Anthropic → billed to Anthropic org credits (BYOK)
//   3. Vercel's own provider keys     → automatic AI Gateway retry if a BYOK key fails
export const PRIMARY_MODEL = "google/gemini-3.8-flash";
export const FALLBACK_MODELS = ["anthropic/claude-sonnet-5.5"];

export const gatewayOptions = {
  models: FALLBACK_MODELS,
  // Hard filter: Gemini only via Vertex, Claude only via Anthropic.
  only: ["vertex", "anthropic"],
} satisfies GatewayProviderOptions;

export type ModelChoice = { id: string; gateway: Pick<GatewayProviderOptions, "models" | "only"> };

export const defaultModel: ModelChoice = { id: PRIMARY_MODEL, gateway: gatewayOptions };

// Each model alone, with no fallback, so an eval score belongs to the model it names.
export const evalModels = {
  gemini: { id: PRIMARY_MODEL, gateway: { only: ["vertex"] } },
  claude: { id: FALLBACK_MODELS[0], gateway: { only: ["anthropic"] } },
} satisfies Record<string, ModelChoice>;

// Per-feature gateway options: cache the static prefix (Anthropic needs this; Gemini caches on its
// own) and tag requests so spend and latency can be split by feature in AI Gateway.
export function gatewayOptionsFor(model: ModelChoice, feature: "agent" | "call-summary") {
  return { ...model.gateway, caching: "auto" as const, tags: [`feature:${feature}`] };
}
