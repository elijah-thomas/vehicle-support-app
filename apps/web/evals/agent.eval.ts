import type { ModelMessage } from "ai";
import { afterAll, describe, expect, test } from "vitest";
import { evalModels } from "@/lib/ai/models";
import { summarizeUsage } from "@/lib/ai/usage";
import { createVehicleAgent } from "@/lib/ai/vehicle-agent";
import { loadVehicleRecord } from "@/lib/ai/load-vehicle-record";
import { agentCases, everyAnswer, nextStepsFormat } from "./cases";
import { checkText, checkTools } from "./checks";
import { loaders } from "./loaders";
import { askEve } from "./eve-client";
import { createReport, runs } from "./report";

const report = createReport("agent");
afterAll(() => report.print());

// EVAL_ENGINE=eve runs the same cases and checks against the Eve version (D28) at EVAL_URL, a local
// `pnpm dev` or a Preview. It uses the production model order, so its row compares with "claude".
const eveUrl = process.env.EVAL_ENGINE === "eve" ? process.env.EVAL_URL : undefined;
if (process.env.EVAL_ENGINE === "eve" && !eveUrl) throw new Error("EVAL_ENGINE=eve needs EVAL_URL");

if (eveUrl) {
  describe.concurrent("eve", () => {
    const cases = agentCases.flatMap((c) => runs.map((run) => ({ ...c, run })));
    test.each(cases)("$name (run $run)", async (c) => {
      // Earlier questions go to the same conversation; Eve keeps the answers on the server and
      // lists their next steps itself (agent/instructions/2-record.ts).
      const result = await askEve(eveUrl, c.vin, [...(c.history ?? []), c.prompt]);
      const failures = [
        ...checkTools(result.tools, c.tools),
        ...checkText(result.text, c),
        ...checkText(result.text, everyAnswer),
        ...(c.nextSteps ? checkText(result.text, nextStepsFormat) : []),
      ];
      report.add({
        model: "eve",
        case: c.name,
        run: c.run,
        pass: failures.length === 0,
        failures,
        output: { tools: result.tools, text: result.text },
        seconds: result.seconds,
        steps: result.steps,
        tokens: result.tokens,
      });
      expect(failures, `tools: ${result.tools.join(", ") || "none"}\n\n${result.text}`).toEqual([]);
    });
  });
}

for (const [modelName, model] of eveUrl ? [] : Object.entries(evalModels)) {
  describe.concurrent(modelName, () => {
    const cases = agentCases.flatMap((c) => runs.map((run) => ({ ...c, run })));
    test.each(cases)("$name (run $run)", async (c) => {
      const record = await loadVehicleRecord(c.vin, loaders);
      if (!record) throw new Error(`Vehicle ${c.vin} not found on staging`);
      // Earlier turns go back as text only, as the route sends them (it drops tool results, D16),
      // and their next steps are listed for the model, as the route does (D17).
      const messages: ModelMessage[] = [];
      const answers: string[] = [];
      for (const prompt of c.history ?? []) {
        messages.push({ role: "user", content: prompt });
        const earlier = await createVehicleAgent(record, { model, loaders, earlierAnswers: answers }).generate({ messages });
        messages.push({ role: "assistant", content: earlier.text });
        answers.push(earlier.text);
      }
      messages.push({ role: "user", content: c.prompt });
      // Timed from the last question, so multi-turn cases compare with single-turn ones.
      const started = performance.now();
      const result = await createVehicleAgent(record, { model, loaders, earlierAnswers: answers }).generate({ messages });
      const called = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));

      const failures = [
        ...checkTools(called, c.tools),
        ...checkText(result.text, c),
        ...checkText(result.text, everyAnswer),
        ...(c.nextSteps ? checkText(result.text, nextStepsFormat) : []),
      ];
      report.add({
        model: modelName,
        case: c.name,
        run: c.run,
        pass: failures.length === 0,
        failures,
        output: { tools: called, text: result.text },
        seconds: (performance.now() - started) / 1000,
        steps: result.steps.length,
        tokens: result.totalUsage.totalTokens,
        reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens,
        costUsd: summarizeUsage(result.steps).marketCostUsd,
      });
      expect(failures, `tools: ${called.join(", ") || "none"}\n\n${result.text}`).toEqual([]);
    });
  });
}
