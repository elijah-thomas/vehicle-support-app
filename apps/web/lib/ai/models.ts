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
