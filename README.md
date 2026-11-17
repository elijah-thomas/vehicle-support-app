# Vehicle Support

The vehicle workspace of Meridian Motors' support tool for service advisors, rebuilt in Next.js
on Vercel with an AI assistant. The API and database stay on Google Cloud.

- **Live app:** [vehicle-support-app.vercel.app](https://vehicle-support-app.vercel.app/) (no sign-in)
- **Proposal:** [`docs/vehicle-support-proposal.pdf`](docs/vehicle-support-proposal.pdf): the
  problem, architecture, Vercel choices, rollout, measures, risks, and what to try in the app
- **Decisions:** [`docs/decisions.md`](docs/decisions.md), each with the options considered

## Layout

```
apps/web/              Next.js 16 app on Vercel (App Router, Cache Components, AI SDK)
  lib/customer/        The only code that talks to Meridian's systems
  lib/ai/              The assistant and call summary
  evals/               Checks that AI answers stay grounded, on each model
services/vehicle-api/  Express API on Cloud Run, Postgres on Cloud SQL (Prisma)
infra/                 Terraform for Google Cloud and Vercel
docs/                  Proposal and decision log
```

## Run it locally

Runs offline (Next.js, the API and Postgres in Docker). Needs Node 22+, pnpm and Docker.

```bash
pnpm install
cp services/vehicle-api/.env.example services/vehicle-api/.env
pnpm db:reset    # start Postgres, apply migrations, load synthetic data
pnpm dev:local   # web on :3000, API on :8080
```

The assistant and call summary need an `AI_GATEWAY_API_KEY` in
`apps/web/.env.development.local`; everything else works without it. `pnpm dev` runs against the
staging API instead, using `vercel env pull`. All variables are in
[`apps/web/.env.example`](apps/web/.env.example).

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`. `pnpm eval` makes real model calls; see
[`apps/web/evals/README.md`](apps/web/evals/README.md).
