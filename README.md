# Vehicle Support

An advisor console for Meridian Motors' service advisors. It runs on Vercel and reads customer,
vehicle, telematics and case data from systems that stay in Meridian's Google Cloud project.
Advisors look up a vehicle by VIN or customer email, see its status at a glance, ask an assistant
about its history, and turn a call transcript into a case note.

- **Proposal** (problem, architecture, Vercel choices, rollout, success measures, risks):
  [`docs/vehicle-support-proposal.pdf`](docs/vehicle-support-proposal.pdf)
- **Architecture**, current and target, with what stays on Google Cloud:
  [`docs/vehicle-support-architecture.pdf`](docs/vehicle-support-architecture.pdf)
- **Decisions**, each with the options considered and why: [`docs/decisions.md`](docs/decisions.md)

## Try it

**[vehicle-support-app.vercel.app](https://vehicle-support-app.vercel.app/)**. No sign-in needed.
Open the lookup, or press `/` on any page.

| Try | What to look for |
| --- | --- |
| Dana Whitfield's 2024 Aster EV, `0MRAE4LR5RA100001` | The status row flags a critical fault for the 3rd time. Ask "Is this a recurring issue?" |
| Marcus Bell's 2023 Kestrel 1500, `0MRKC15V8PA200002` | An open recall matches the complaint. Ask "Could an open recall explain the complaint?" |
| Call summary, on either vehicle | Open the Call summary tab, choose "Use example transcript", review the draft and save it. The note appears in Case history. |
| `jordan.okafor@example.com` | A customer with two vehicles: the lookup asks which one the call is about. |

## How it's built

```
apps/web/              Next.js 16 app on Vercel (App Router, Cache Components, AI SDK)
  lib/customer/        The boundary: the only code that talks to Meridian's systems
  lib/ai/              The assistant, the call summary and the record they're given
  evals/               Checks that AI answers stay grounded, on each model
services/vehicle-api/  Express API on Cloud Run, Postgres on Cloud SQL (Prisma)
infra/                 Terraform for Google Cloud, plus Vercel Firewall rules
docs/                  Proposal and decision log
```

- The vehicle page serves a static shell from Vercel's edge; each panel (specs, telematics, cases)
  streams in and fails on its own. Specs and recalls are cached for hours, cases for minutes and
  cleared when a note is saved, telematics never.
- The app reaches the API with a short-lived Vercel OIDC token, exchanged through Workload Identity
  Federation for a Google identity that Cloud Run's IAM accepts. No key is stored for this path.
  Preview deployments can only reach staging; production can only reach production.
- The assistant gets the vehicle's record up front, with one tool for older telematics. AI Gateway
  sends requests to Gemini on Vertex AI first and to Claude if Vertex fails, on Meridian's own keys.
- Vercel Firewall limits the AI routes to 20 requests a minute per IP and note saves to 30.

## Run it locally

The web app reaches the API only through Vercel's OIDC token, so running it locally needs access
to the Vercel project (`vercel env pull`). Without it, the API runs on its own: `services/vehicle-api`
has `db:up`, `db:migrate`, `db:seed` and `dev` scripts (Docker for Postgres), documented in
[`.env.example`](services/vehicle-api/.env.example).

Checks: `pnpm typecheck`, `pnpm lint` and `pnpm test` (the API tests need the Docker Postgres).
`pnpm eval` makes real model calls; see [`apps/web/evals/README.md`](apps/web/evals/README.md).

## Development tooling

- **Editor and agent:** VS Code, with Claude Code as the coding agent. Each architectural decision
  is recorded with the options considered in [`docs/decisions.md`](docs/decisions.md), and marked
  in the code with a `Decision (Dnn)` comment where it lands.
- **Commits:** git-flow branches, Conventional Commits, merged without squashing, so the history
  shows how the work evolved.

### How the AI's behaviour was validated

- **Evals** (`pnpm eval`) run the real assistant and call-summary request against staging data, on
  each model alone, three times per case, graded deterministically (required facts present;
  internal IDs, invented fault codes, assumed pronouns and promised buybacks absent). Today:
  assistant 30/30 and call summaries 21/21 on both models.
- **Checked by hand:** the boundary end to end from a Vercel deployment, the Firewall limits, a
  simulated telematics outage and failed saves in the browser.
