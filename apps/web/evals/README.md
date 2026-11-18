# Evals

Checks that the agent and call summaries stay grounded, on each model alone. See
`docs/decisions.md#tests-and-evals` (D21).

```bash
gh workflow run deploy-api.yml --ref develop -f reseed=true   # reset staging to the seed data
vercel env pull apps/web/.env.local --environment=development  # staging API + OIDC token (~12h)
pnpm eval                                                      # EVAL_RUNS=1 for a quick pass
```

The Eve version of the assistant (D28) runs the same assistant cases over its own API, against a
local `pnpm dev` or a Preview (`EVAL_BYPASS` is the Preview's automation bypass secret):

```bash
EVAL_ENGINE=eve EVAL_URL=http://localhost:3000 pnpm eval evals/agent.eval.ts
```

It reports as `eve`, on the production model order, so compare it with `claude`. Its cost column
shows n/a: Eve reports tokens, not list price; AI Gateway's `feature:agent-eve` tag has the cost.

| File | What it holds |
|---|---|
| `cases.ts` | Prompts and transcripts, the tools each must call, and the text it must and must not contain |
| `checks.ts` | The deterministic grading |
| `agent.eval.ts`, `call-summary.eval.ts` | Run each case per model, several times |
| `eve-client.ts` | Asks the Eve version a case's questions over HTTP |
| `loaders.ts` | Staging API reads, fetched once per run |
| `report.ts` | Pass-rate tables; full outputs go to `results/` (gitignored) |

Real model calls cost a few cents per run and results vary between runs, so read the pass rate,
not a single result.
