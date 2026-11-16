import { mkdirSync, writeFileSync } from "node:fs";

// Each case runs several times: models aren't deterministic, so one pass proves little.
export const RUNS = Number(process.env.EVAL_RUNS ?? 3);
export const runs = Array.from({ length: RUNS }, (_, i) => i + 1);

export type Row = {
  model: string;
  case: string;
  run: number;
  pass: boolean;
  seconds: number;
  steps?: number;
  tokens?: number;
  costUsd?: number;
  failures: string[];
  output: unknown;
};

// Prints pass rates per (model, case) and per model, so the two models can be compared.
// Every output goes to evals/results/ (gitignored) for reading answers, not just pass/fail.
export function createReport(name: string) {
  const rows: Row[] = [];
  return {
    add: (row: Row) => rows.push(row),
    print: () => {
      rows.sort((a, b) => a.case.localeCompare(b.case) || a.model.localeCompare(b.model) || a.run - b.run);
      const dir = new URL("./results/", import.meta.url);
      mkdirSync(dir, { recursive: true });
      writeFileSync(new URL(`latest-${name}.json`, dir), JSON.stringify(rows, null, 2));

      const summarize = (group: Row[]) => ({
        passed: `${group.filter((r) => r.pass).length}/${group.length}`,
        "median s": median(group.map((r) => r.seconds)).toFixed(1),
        "avg tokens": Math.round(average(group.map((r) => r.tokens ?? 0))),
        // AI Gateway's list-price cost per answer; see lib/ai/usage.ts.
        "avg cost $": average(group.map((r) => r.costUsd ?? 0)).toFixed(5),
      });
      const byCase = groupBy(rows, (r) => `${r.model}\u0000${r.case}`).map((group) => ({
        model: group[0].model,
        case: group[0].case,
        ...summarize(group),
      }));
      const byModel = groupBy(rows, (r) => r.model).map((group) => ({
        model: group[0].model,
        case: "ALL",
        ...summarize(group),
      }));

      console.log(`\n${name} evals (${RUNS} runs per case)`);
      console.table([...byCase, ...byModel]);
    },
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.values()];
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
