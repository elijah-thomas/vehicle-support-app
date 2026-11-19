import { deliveries, runs } from "eve/events";
import { defineHook } from "eve/hooks";
import { overStepCap, questionTooLong } from "../lib/limits";

// Decision (D28): the browser talks to Eve's own routes, so D16's limits are checked here, before
// each model call: a question over 2,000 characters, or a 4th model call in one answer, cancels the
// turn. Trade-off: a cancelled turn has no partial answer. See docs/decisions.md#eve-assistant
export default defineHook({
  events: {
    async "model.requested"(_event, ctx) {
      const turnId = ctx.turn?.id;
      if (!turnId) return;
      const question = deliveries(ctx.view, { turnId }).flatMap((delivery) => delivery.parts ?? []);
      if (questionTooLong(question)) ctx.cancel("too_long");
      else if (overStepCap(runs(ctx.view, { turnId }).length)) ctx.cancel("step_cap");
    },
  },
});
