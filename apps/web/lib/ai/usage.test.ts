import { expect, test } from "vitest";
import { summarizeUsage } from "./usage";

const step = (gateway: unknown, usage = { inputTokens: 1000, outputTokens: 200, inputTokenDetails: { cacheReadTokens: 800 } }) => ({
  usage,
  providerMetadata: { gateway },
});

test("sums AI Gateway's cost and tokens across an answer's steps", () => {
  const routing = {
    finalProvider: "vertex",
    totalProviderAttemptCount: 1,
    modelAttempts: [{ canonicalSlug: "google/gemini-3.8-flash", success: true }],
  };
  const usage = summarizeUsage([
    step({ marketCost: "0.0002", gatewayCost: "0.000075", routing }),
    step({ marketCost: "0.0001", gatewayCost: "0.000075", routing }),
  ]);
  expect(usage).toMatchObject({ model: "google/gemini-3.8-flash", provider: "vertex", steps: 2, inputTokens: 2000, cachedInputTokens: 1600, outputTokens: 400, providerAttempts: 2 });
  expect(usage.marketCostUsd).toBeCloseTo(0.0003);
  expect(usage.gatewayCostUsd).toBeCloseTo(0.00015);
});

test("names the fallback model when the primary failed", () => {
  const usage = summarizeUsage([
    step({
      marketCost: "0.001",
      routing: {
        finalProvider: "anthropic",
        totalProviderAttemptCount: 2,
        modelAttempts: [
          { canonicalSlug: "google/gemini-3.8-flash", success: false },
          { canonicalSlug: "anthropic/claude-sonnet-5.5", success: true },
        ],
      },
    }),
  ]);
  expect(usage).toMatchObject({ model: "anthropic/claude-sonnet-5.5", provider: "anthropic", providerAttempts: 2 });
});

test("still counts tokens when a step has no gateway metadata", () => {
  expect(summarizeUsage([step(undefined)])).toMatchObject({ model: null, inputTokens: 1000, marketCostUsd: 0 });
});
