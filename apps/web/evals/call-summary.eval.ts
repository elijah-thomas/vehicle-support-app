import { generateText } from "ai";
import { afterAll, describe, expect, test } from "vitest";
import { callSummaryRequest } from "@/lib/ai/call-summary";
import { evalModels } from "@/lib/ai/models";
import { everyNote, summaryCases } from "./cases";
import { checkText } from "./checks";
import { loaders } from "./loaders";
import { createReport, runs } from "./report";

const report = createReport("call-summary");
afterAll(() => report.print());

for (const [modelName, model] of Object.entries(evalModels)) {
  describe.concurrent(modelName, () => {
    const cases = summaryCases.flatMap((c) => runs.map((run) => ({ ...c, run })));
    test.each(cases)("$name (run $run)", async (c) => {
      const [vehicle, cases, telematics] = await Promise.all([
        loaders.getVehicle(c.vin),
        loaders.getCases(c.vin),
        loaders.getTelematics(c.vin, 20),
      ]);
      if (!vehicle) throw new Error(`Vehicle ${c.vin} not found on staging`);

      const started = performance.now();
      const { output, totalUsage } = await generateText(callSummaryRequest({ vehicle, cases, telematics }, c.transcript, model));
      const note = [output.summary, ...output.nextSteps].join("\n");

      const failures = [
        ...checkText(output.issue, c.issue),
        ...checkText(note, c.note),
        ...checkText([output.issue, note].join("\n"), everyNote),
        ...(output.nextSteps.length >= 1 && output.nextSteps.length <= 6 ? [] : [`${output.nextSteps.length} next steps`]),
      ];
      report.add({
        model: modelName,
        case: c.name,
        run: c.run,
        pass: failures.length === 0,
        failures,
        output,
        seconds: (performance.now() - started) / 1000,
        tokens: totalUsage.totalTokens,
      });
      expect(failures, JSON.stringify(output, null, 2)).toEqual([]);
    });
  });
}
