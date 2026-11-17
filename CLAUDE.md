# CLAUDE.md

This repo is a Vercel Solutions Architect take-home: a small Next.js demo deployed on Vercel that
crosses a boundary into a customer's existing system and uses an AI-stack primitive. Reviewers read
the code and the commit history, and in the interview they will ask me to explain, defend, and
change it live. Every rule below follows from that: **a human must be able to read and navigate
this repo in minutes, and I must have made and understood every architectural decision in it.**

## Scenario (settled — see docs/decisions.md D1 and D28)

- **Customer:** Meridian Motors, a fictional mid-market automaker (all data synthetic). About 80
  service advisors in North America, Europe and the Middle East.
- **Current stack:** a React app (Vite) in Cloud Storage behind Cloud CDN, Entra ID sign-in,
  REST services on Cloud Run called from the browser, one shared staging.
- **Vercel role:** the console is rebuilt in Next.js on Vercel, screen by screen. The vehicle
  workspace moves first and gains an AI assistant. A pilot group validates each screen, then all
  advisors switch over.
- **What stays on GCP:** the API and the database of customers, vehicles, telematics and cases.
- **Demo:** look up a vehicle, see its status, ask the assistant about its history, and turn a
  call transcript into a saved case note.

## In scope

Only these are agreed. Anything beyond this list is a decision point.

1. **GCP backend:** Express on Cloud Run + Cloud SQL Postgres, seeded with ~5 synthetic
   customers/vehicles with built-in stories (recurring fault code, open recall). Endpoints:
   customer by email, vehicle by VIN (specs/config), telematics, cases, `POST` case note.
   Zod validation, light rate limit.
2. **Boundary:** Vercel OIDC → WIF → Cloud Run IAM, in `lib/customer/`. GitHub Actions deploys
   Cloud Run via WIF.
3. **Vehicle page:** search by email/VIN. Static shell, specs cached long, telematics fresh and
   streamed, cases cached and invalidated on note save.
4. **Agent chat:** AI SDK, read-only tools per lookup, AI Gateway failover per D5, canned
   prompts, step cap.
5. **Call summary:** paste transcript → structured draft (issue, summary, next steps) → rep
   edits → save to Postgres → invalidate cases. 2–3 canned transcripts.
6. **Protection:** Vercel Firewall rate limit on AI routes, transcript size and output caps.
7. **Evals:** ~8 cases (expected tools + required facts), run on both models.
8. **Docs:** the 8 submission sections, including a Preview Deployments rollout plan.

**Out of scope (documented only):** Workflows (phase 2), Secure Compute / private networking,
rep login, Rolling Releases.

**Build order** (each step ends with a proposed commit): monorepo scaffold → DB schema + seed
(data shapes are a decision point) → Express API locally → Cloud Run deploy + WIF spike from a
Vercel preview, incl. the cached-function check (timebox ~2h) → GitHub Actions deploy → vehicle
page → agent + tools (tool design is a decision point) → call summary + save → rate limits,
evals, docs.

## How we work: I make the decisions

I have to own and defend every choice in this repo, so we decide together and **before** code is
written. Your job is to surface decisions, explain them, and recommend. My job is to choose.

**Start every session by reading `docs/decisions.md`.** Treat what's there as settled. If
something should be revisited, raise it as a new decision; never silently change direction.

**You may decide on your own (foundational / conventional):** scaffolding, config, linting,
formatting, file placement that follows the structure below, naming, standard Next.js and React
patterns, small refactors inside an approved approach, and fixing obvious bugs.

**Stop and ask me first (decision points):** anything that changes the architecture or that a
reviewer could ask "why did you do it this way?" about. For example:
- what stays outside Vercel, and how the demo crosses the boundary (network path, auth)
- which Vercel primitives to use and where
- rendering and caching for a route (static vs cached vs streamed, cache lifetime, invalidation)
- agent design: tools, their inputs and limits, model choice, fallback order, durability
- data shapes and contracts with the customer's systems
- protecting the public AI endpoint (rate limits, token limits, spend caps) — required before
  the first public deploy
- adding a dependency or service, or anything that costs money
- scope: building anything not in "In scope"

When you hit a decision point, present it like this, then wait for my answer:

1. **The decision:** one sentence on what needs choosing and why it matters now.
2. **Options:** 2–3 realistic options. For each: how it works, pros, cons, cost or complexity.
3. **Recommendation:** which one you'd pick and why, in plain language.
4. **Interview angle:** how I'd explain or defend it, and what might be asked about it.

Rules for collaborating:
- Plan before building. For any non-trivial feature, list its decision points first, settle them
  with me, then implement.
- If a decision comes up mid-implementation, pause there. Don't pick a default and keep going.
- Prefer the simplest version that proves the point. The whole build targets 4–6 hours.
- Keep it teachable: briefly explain Vercel/Next.js/GCP concepts I may not know yet, with links
  to the docs you used.
- After I decide, add an entry to `docs/decisions.md`: the decision, options considered, what I
  chose, and why. This is my interview study guide and the record reviewers see.
- After each piece of work, give me a short walkthrough: files changed, what each does, and any
  choices you made on your own.

## Git and attribution

- Do **not** add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution to commit
  messages, PR titles, or PR descriptions.
- Branches (git-flow):
  - `master`: production. Vercel's production branch. Only receives merges from `release/*`
    (and hotfix `fix/*` branches when needed).
  - `develop`: integration branch. All work branches start here and merge back here.
  - `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`: one branch per piece of work,
    branched from `develop`.
  - `release/YY.MM.DD.N` (date-based, D32; N counts releases that day, starting at 1): cut from
    `develop`, merged into `master` and back into `develop`, then tagged `vYY.MM.DD.N`.
- Merge with `--no-ff` so each branch stays visible in history. Never squash.
- Propose a commit at each natural stopping point (message included); commit only after I
  approve. The history is part of the submission and should show how the work evolved.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
  `test:`), imperative mood, subject under 72 chars, body explains *why* when it isn't obvious.
- Never rewrite pushed history: no force-push, squash, rebase, or amend of pushed commits.
- Never commit secrets. `.env*.local` is gitignored; document every variable in `.env.example`.

## Stack

**Settled:** Next.js 16 (App Router), React 19, TypeScript `strict`, Tailwind CSS + shadcn/ui
(Base UI), pnpm
workspaces, Zod at every boundary. AI SDK + AI Gateway (BYOK GCP credentials), Cache
Components, Fluid Compute, Vercel Firewall rate limiting. Express on Cloud Run, Cloud SQL
Postgres via Prisma (D2). See `docs/decisions.md`.

Vercel OIDC → GCP Workload Identity Federation → Cloud Run IAM for boundary auth (D3).

Model failover: Gemini on Vertex → Claude on Anthropic, both BYOK (D5).

These APIs move fast. Before writing code against Next.js 16, AI SDK, AI Gateway, or Workflows,
check current docs (nextjs.org/docs, ai-sdk.dev, vercel.com/docs) instead of relying on memory.
Avoid deprecated patterns: `middleware.ts` (now `proxy.ts`), sync `params`/`searchParams`,
`pages/` router, `getServerSideProps`.

## Next.js practices

- Server Components by default; `"use client"` only on the smallest leaf that needs it.
- Every route should make it obvious what is static, what is cached, and what streams behind
  `<Suspense>`. The specific caching choices are decision points.
- Fetch data in Server Components or `lib/`, not `useEffect`. Mutations via Server Actions;
  Route Handlers only for streaming AI responses or non-React callers.
- `loading.tsx` / `<Suspense>` fallbacks where data loads, `error.tsx` where failure is possible.
- Server-only modules import `server-only`. Secrets never reach the client.

## Project structure

pnpm-workspace monorepo. Each app deploys independently.

```
apps/web/                 Next.js app → Vercel (Git integration, root directory apps/web)
  app/                    Routes only. Thin: compose components, call lib/. No business logic.
  components/             Shared UI. One component per file, kebab-case filenames (shadcn style).
    ui/                   shadcn components. Add with `pnpm dlx shadcn@latest add <name>`.
  lib/
    customer/             THE BOUNDARY: clients for the systems that stay on GCP. Everything
                          that talks to them lives here and only here.
    env.ts                Zod-validated env vars; the only place process.env is read.
  evals/                  Canned prompts + expected behavior for validating the AI.
services/vehicle-api/     Express API → Cloud Run (GitHub Actions). Owns the Postgres schema.
  prisma/                 schema.prisma, migrations, seed.ts (synthetic data).
  src/                    Express server; src/generated/ is Prisma output (gitignored).
  docker-compose.yml      Local Postgres 17 on port 5440.
infra/                    Terraform for GCP (D9). Never change GCP by hand; edit here and
                          `terraform plan` first. sql/ holds Postgres GRANTs Terraform can't manage.
.github/workflows/        deploy-api.yml: develop → staging, master → production (D12, D13).
docs/                     decisions.md, architecture, rollout plan, submission write-up.
```

- Create other folders (e.g. `lib/ai/`) only once the related decision is made. No barrel
  `index.ts` files. Name things in the domain (`getVehicleByVin`), not `utils`.
- The web app never talks to Postgres directly; only through `services/vehicle-api`.

## Comments

- Where an architectural decision lands in code, add a short comment (2–4 lines) at that line:
  `// Decision (Dnn): what was chosen. Why: … Trade-off: … See docs/decisions.md#<anchor>`.
  Reviewers read these in place; the full options and reasoning live in `docs/decisions.md`.
- Only decisions listed in `docs/decisions.md` get this format. Don't record conventional
  choices (libraries, styling, layout tweaks) as decisions.
- Otherwise comments are rare and explain only non-obvious *why*. Never narrate the code.

## Commands

Created during scaffolding; confirm they exist in `package.json` before relying on them.

```
pnpm dev | pnpm build | pnpm lint | pnpm typecheck | pnpm test
```

Run `pnpm typecheck && pnpm lint && pnpm build` before telling me a change is done.
