import { z } from "zod";

// The parts of an AI SDK step this reads, so evals and both routes can pass their own step types.
type StepLike = {
  usage: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } };
  providerMetadata?: Record<string, unknown>;
};

const gatewayMetadataSchema = z.object({
  marketCost: z.coerce.number().optional(),
  gatewayCost: z.coerce.number().optional(),
  routing: z
    .object({
      finalProvider: z.string().optional(),
      totalProviderAttemptCount: z.number().optional(),
      modelAttempts: z.array(z.object({ canonicalSlug: z.string(), success: z.boolean() })).optional(),
    })
    .optional(),
});

export type AnswerUsage = {
  model: string | null;
  provider: string | null;
  providerAttempts: number;
  steps: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  marketCostUsd: number;
  gatewayCostUsd: number;
};

// Decision (D22): cost comes from AI Gateway's per-response metadata, summed over an answer's steps.
// Why: it's priced by the Gateway, so no price table to keep current. Trade-off: with our own keys,
// marketCost is list price; the real bill is the provider's invoice. See docs/decisions.md#cost-per-answer
export function summarizeUsage(steps: readonly StepLike[]): AnswerUsage {
  const usage: AnswerUsage = {
    model: null,
    provider: null,
    providerAttempts: 0,
    steps: steps.length,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    marketCostUsd: 0,
    gatewayCostUsd: 0,
  };
  for (const step of steps) {
    usage.inputTokens += step.usage.inputTokens ?? 0;
    usage.cachedInputTokens += step.usage.inputTokenDetails?.cacheReadTokens ?? 0;
    usage.outputTokens += step.usage.outputTokens ?? 0;
    const gateway = gatewayMetadataSchema.safeParse(step.providerMetadata?.gateway);
    if (!gateway.success) continue;
    usage.marketCostUsd += gateway.data.marketCost ?? 0;
    usage.gatewayCostUsd += gateway.data.gatewayCost ?? 0;
    usage.providerAttempts += gateway.data.routing?.totalProviderAttemptCount ?? 0;
    usage.provider = gateway.data.routing?.finalProvider ?? usage.provider;
    usage.model = gateway.data.routing?.modelAttempts?.find((a) => a.success)?.canonicalSlug ?? usage.model;
  }
  return usage;
}

// One structured line per answer in Vercel's runtime logs: what it cost, and whether failover ran.
export function logUsage(feature: "agent" | "call-summary", steps: readonly StepLike[]) {
  console.info(JSON.stringify({ event: "ai_usage", feature, ...summarizeUsage(steps) }));
}
