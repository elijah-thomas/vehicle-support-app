# Evals

Checks that the agent and call summaries stay grounded, on each model alone. See
`docs/decisions.md#evals` (D19).

```bash
gh workflow run deploy-api.yml --ref develop -f reseed=true   # reset staging to the seed data
vercel env pull apps/web/.env.local --environment=development  # staging API + OIDC token (~12h)
pnpm eval                                                      # EVAL_RUNS=1 for a quick pass
```

| File | What it holds |
|---|---|
| `cases.ts` | Prompts and transcripts, the tools each must call, and the text it must and must not contain |
| `checks.ts` | The deterministic grading |
| `agent.eval.ts`, `call-summary.eval.ts` | Run each case per model, several times |
| `loaders.ts` | Staging API reads, fetched once per run |
| `report.ts` | Pass-rate tables; full outputs go to `results/` (gitignored) |

Real model calls cost a few cents per run and results vary between runs, so read the pass rate,
not a single result.
