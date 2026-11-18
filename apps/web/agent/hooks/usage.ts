import { runs } from "eve/events";
import { defineHook } from "eve/hooks";

// The same ai_usage line as the AI SDK version (lib/ai/usage.ts), once per answer. Eve reports
// tokens but not the list price, so cost per answer comes from AI Gateway's `feature:agent-eve`
// tag (D22).
export default defineHook({
  events: {
    async "turn.settled"(_event, ctx) {
      const turnId = ctx.turn?.id;
      if (!turnId) return;
      // Only model calls that ran: one the limits hook cancelled (agent/hooks/limits.ts) used nothing.
      const turnRuns = runs(ctx.view, { turnId }).filter((run) => run.usage);
      if (turnRuns.length === 0) return;
      const total = (field: "inputTokens" | "cacheReadTokens" | "outputTokens") =>
        turnRuns.reduce((sum, run) => sum + (run.usage?.[field] ?? 0), 0);
      console.info(
        JSON.stringify({
          event: "ai_usage",
          feature: "agent-eve",
          model: turnRuns.findLast((run) => run.modelId)?.modelId ?? null,
          steps: turnRuns.length,
          inputTokens: total("inputTokens"),
          cachedInputTokens: total("cacheReadTokens"),
          outputTokens: total("outputTokens"),
        }),
      );
    },
  },
});
