# Vehicle Support

Meridian Motors' service advisors support customers' vehicles across North America, Europe and
the Middle East. When a customer calls about an issue, the advisor uses this app to diagnose the
problem, recommend next steps and manage the support case.

The app is a React single-page app. As Meridian grows, it has become slow for advisors far from
its servers, slow to change, and hard to extend securely with AI. Meridian has decided to move
to Next.js and is now deciding whether to host it on Vercel.

This repo makes the case for Vercel. It rebuilds the vehicle screen, the one every call starts on,
in Next.js on Vercel, with an AI assistant for advisors. Customer data stays in Meridian's Google
Cloud.

**[Open the live app](https://vehicle-support-app.vercel.app/)** (no sign-in) ·
[Proposal, 6 pages](docs/vehicle-support-proposal.pdf) · [Decision log](docs/decisions.md)

## Why Vercel

- **Performance:** the page shell loads from the nearest location, and pages render next to
  Meridian's APIs and stream in, so advisors far from Iowa still get a fast screen.
- **Development speed:** every change gets its own preview, so product reviews happen the same day.
- **Secure AI:** the assistant runs on the server, so customer data never passes through the
  browser to a model.

The targets are a usable screen within 2.5 s in every region, calls 10% shorter, and weekly
releases.

## Try it: Dana's recurring fault

Dana Whitfield's 2024 Aster EV has lost power on the highway. The same battery fault has now
appeared three times, two dealer visits haven't fixed it, and Dana wants a buyback.

1. **Open the vehicle.** In the [live app](https://vehicle-support-app.vercel.app/), click the
   lookup and pick Dana Whitfield. The status row, telematics and case history load right away,
   and the assistant suggests questions for this vehicle.
2. **Diagnose.** In the **Ask** tab, choose *"Is P0C73 a recurring issue?"* The assistant brings
   the three faults and both earlier repairs together in one answer, so the advisor doesn't have
   to piece it together from telematics and case history mid-call.
3. **Recommend.** Ask *"What should I tell Dana?"* The answer turns the record into what to say to
   the customer and what to do next.
4. **Manage the case.** Switch to **Call summary**, choose **Use example transcript**, and review
   the draft note. Save it to the open case. It appears in Case history, and the assistant reads
   it on the next call.

## How it's built

Next.js 16 (App Router, AI SDK) runs on Vercel and calls Meridian's existing API on Cloud Run,
which reads Postgres on Cloud SQL. The prototype uses these Vercel features: Cache Components,
Runtime Cache, AI Gateway (Gemini on Vertex AI, with Claude as fallback), OIDC federation to
Google Cloud, preview deployments and Instant Rollback. Page 4 of the
[proposal](docs/vehicle-support-proposal.pdf) explains each choice. Evals check the assistant on
both models before each release.

```
apps/web/              Next.js app on Vercel
  lib/customer/        The only code that talks to Meridian's systems
  lib/ai/              The assistant and call summary
  evals/               Checks that AI answers stay grounded, on each model
services/vehicle-api/  Express API on Cloud Run, Postgres on Cloud SQL (Prisma)
infra/                 Terraform for Google Cloud and Vercel
docs/                  Proposal and decision log
```

## Run it locally

Runs offline: Next.js, the API, and Postgres in Docker. Requires Node 22+, pnpm and Docker.

```bash
pnpm install
cp services/vehicle-api/.env.example services/vehicle-api/.env
pnpm db:reset    # start Postgres, apply migrations, load sample data
pnpm dev:local   # web on :3000, API on :8080
```

The assistant and call summary need an `AI_GATEWAY_API_KEY` in
`apps/web/.env.development.local`. Everything else works without it. To run against the staging
API instead, use `pnpm dev`, which gets its settings from `vercel env pull`. All variables are
listed in [`apps/web/.env.example`](apps/web/.env.example).

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`. `pnpm eval` makes real model calls; see
[`apps/web/evals/README.md`](apps/web/evals/README.md).