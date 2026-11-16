import { afterAll, describe, expect, test } from "vitest";
import { evalModels } from "@/lib/ai/models";
import { createVehicleAgent } from "@/lib/ai/vehicle-agent";
import { agentCases, answerFormat, everyAnswer } from "./cases";
import { checkText, checkTools } from "./checks";
import { loaders } from "./loaders";
import { createReport, runs } from "./report";

const report = createReport("agent");
afterAll(() => report.print());

for (const [modelName, model] of Object.entries(evalModels)) {
  describe.concurrent(modelName, () => {
    const cases = agentCases.flatMap((c) => runs.map((run) => ({ ...c, run })));
    test.each(cases)("$name (run $run)", async (c) => {
      const started = performance.now();
      const result = await createVehicleAgent(c.vin, { model, loaders }).generate({ prompt: c.prompt });
      const called = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));

      const failures = [
        ...checkTools(called, c.tools),
        ...checkText(result.text, c),
        ...checkText(result.text, everyAnswer),
        ...(c.declines ? [] : checkText(result.text, answerFormat)),
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
      });
      expect(failures, `tools: ${called.join(", ") || "none"}\n\n${result.text}`).toEqual([]);
    });
  });
}
