# Vehicle Support

An advisor console for Meridian Motors' service advisors. It runs on Vercel and reads customer,
vehicle, telematics and case data from systems that stay in Meridian's Google Cloud project.
Advisors look up a vehicle by VIN or customer email, see its status at a glance, ask an assistant
about its history, and turn a call transcript into a case note.

- **Proposal** (problem, architecture, Vercel choices, rollout, success measures, risks):
  [`docs/vehicle-support-proposal.pdf`](docs/vehicle-support-proposal.pdf)
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

Requires Node 22+, pnpm and the Vercel CLI linked to the project.

```bash
pnpm install
vercel env pull apps/web/.env.local --environment=development  # staging API and a ~12h OIDC token
pnpm --filter web dev                                           # http://localhost:3000
```

To run the API and Postgres locally as well: `services/vehicle-api` has `db:up`, `db:migrate`,
`db:seed` and `dev` scripts. Its variables are documented in
[`.env.example`](services/vehicle-api/.env.example).

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm eval` for the AI evals (real model
calls; see [`apps/web/evals/README.md`](apps/web/evals/README.md)).

## Development tooling

- **Editor and agent:** VS Code, with Claude Code as the coding agent. I made each architectural
  decision before the code was written and recorded it in the decision log, which is also the
  study guide for this submission.
- **Design:** a design system (tokens, components, layout rules) that the app is built against.
- **Commits:** git-flow branches, Conventional Commits, merged without squashing, so the history
  shows how the work evolved.

### How the AI's behaviour was validated

- **Evals** (`pnpm eval`) run the real assistant and the real call-summary request against staging
  data, on each model alone, three times per case. Grading is deterministic: the expected
  information was used, required facts appear, and forbidden text doesn't (internal IDs, invented
  fault codes, assumed pronouns, promised loaners or buybacks). Cases include a request for another
  customer's vehicle and a prompt injection hidden in a transcript.
- **Results today:** assistant 30/30 on Gemini and 30/30 on Claude; call summaries 21/21 on both.
  The evals found and fixed real problems along the way, including assumed pronouns, a missing
  safety step on a critical fault and a stored prompt injection.
- **Checked by hand:** the boundary end to end from a Vercel deployment, the Firewall limits, a
  simulated telematics outage (the rest of the page stays usable) and failed saves in the browser.
