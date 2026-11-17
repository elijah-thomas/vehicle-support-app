# Decisions

The architectural decisions behind this build, numbered in the order they were made. Where a
decision is implemented, a `Decision (Dnn)` comment marks the line.

## Index

- **Scenario:** [D1](#scenario) Scenario · [D28](#current-state) Current state ·
  [D4](#primitives) Vercel primitives
- **Boundary:** [D2](#gcp-backend) GCP backend · [D3](#boundary-auth) Auth across the boundary ·
  [D7](#api-shape) API shape · [D8](#contracts) Contracts · [D10](#db-access) Cloud Run → Cloud
  SQL · [D11](#function-region) Function region · [D34](#concurrency) Concurrency ·
  [D36](#warm-api) Warm API · [D37](#telematics-windows) Past telematics
- **Rendering:** [D14](#vehicle-page-caching) Vehicle page caching · [D17](#vehicle-status)
  Status row · [D29](#error-states) Error states · [D31](#case-view) Case view ·
  [D21](#lookup-and-layout) Lookup · [D41](#vehicle-routes) Vehicle routes ·
  [D42](#fault-case-links) Faults linked to cases · [D43](#layout-freshness) Layout freshness ·
  [D44](#case-actions) Case view and actions · [D45](#call-summary-target) Call summary target
- **AI:** [D5](#models) Models and failover · [D15](#agent) Agent · [D30](#agent-context) Record
  up front · [D16](#call-summary-generation) Call summary · [D26](#junk-transcripts) Non-support
  transcripts · [D33](#cost-per-run) Cost per run · [D19](#evals) Evals ·
  [D39](#assistant-suggestions) Suggested questions
- **Data integrity:** [D6](#data-model) Data model · [D25](#note-ownership) Note ownership ·
  [D22](#save-feedback) Save failures · [D38](#seed-activity) Seeded case activity ·
  [D40](#case-numbers) Case numbers and case actions · [D46](#repeat-safe-save) Repeat-safe save
- **Release path:** [D9](#terraform) Terraform · [D12](#environments) Environments ·
  [D13](#pipeline) API pipeline · [D35](#rollout) Rollout · [D32](#release-versions) Versions ·
  [D24](#tests) Tests
- **Protection and spend:** [D18](#rate-limits) Edge rate limits · [D20](#api-rate-limit-keying)
  API rate limit · [D27](#agent-request) Agent request checks · [D23](#spend-alerts) Spend alerts

---

## D1. Scenario {#scenario}

- **Choice:** Meridian Motors (fictional) is rebuilding its advisors' support console (today a
  React app on Google Cloud) in Next.js on Vercel, one screen at a time. The vehicle workspace moves
  first and gains an AI assistant. The API and database stay on Google Cloud.
- **Options:** A new Vercel-hosted assistant beside the existing app; a full rebuild at once; a
  screen-by-screen rebuild.
- **Why:** The scenario comes from a support tool I worked on. Advisors piece together a
  vehicle's history from several screens, and one workspace with an assistant removes that work.
  Rebuilding one screen at a time lets each screen reach advisors as soon as it's validated
  (D35).

## D2. GCP backend {#gcp-backend}

- **Choice:** Express on Cloud Run with Cloud SQL Postgres. The API owns the Prisma schema.
- **Options:** Cloud Run with Firestore; an external Postgres (Neon).
- **Why:** It's a realistic system of record in Meridian's cloud. The API is the only path to
  the database, and Vercel never connects to Postgres.

## D3. Authenticating across the boundary {#boundary-auth}

- **Choice:** Vercel's OIDC (OpenID Connect) token is exchanged through Workload Identity
  Federation (WIF) for a Google ID token, which Cloud Run IAM checks. The ID token is cached per function instance for about an
  hour.
- **Options:** A shared API key, which is a long-lived secret to leak and rotate.
- **Why:** No secret is stored, access is scoped per Vercel project and environment (D12), and
  anonymous calls get a 403. GitHub Actions deploys the same way (D13).
- **Verified:** The exchange works end to end from a Vercel deployment, including inside a `"use cache"`
  function.
- **Production option:** If Meridian's policy requires private APIs, Vercel Secure Compute and a
  site-to-site VPN can reach an internal load balancer instead (Enterprise).

## D4. Vercel primitives {#primitives}

- **Choice:** AI SDK, AI Gateway, Cache Components with the Runtime Cache, Fluid compute, Vercel
  Firewall and Preview Deployments.
- **Not now:** Workflows. Every AI request is short, changes nothing until the advisor saves, and
  is cheap to retry. Workflows earns its place once summaries need a supervisor's approval.
- **Why Fluid compute:** Agent requests spend most of their time waiting on the model. With Fluid
  compute, one instance serves many of them, and billing counts only active CPU (D34).

## D5. Models and failover {#models}

- **Choice:** Gemini 3.8 Flash on Vertex AI first, then Claude Sonnet 5.5 on Anthropic. Both use
  Meridian's own keys (BYOK, bring your own key): Gemini is billed to Meridian's GCP commitment,
  Claude to Meridian's Anthropic org.
  - **Vercel's keys:** If a BYOK key fails, AI Gateway retries the same model on the same provider
    with Vercel's own key, so either model can also run on Vercel's keys. This is on by default
    ([docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)).
  - **`only: ["vertex", "anthropic"]`** keeps each model on its provider. It doesn't decide whose
    key is used, so it doesn't stop the retry on Vercel's keys.
  - **Unconfirmed order:** The docs don't say how that retry interleaves with the switch to Claude.
    The likely order is Gemini on Meridian's key, Gemini on Vercel's, Claude on Meridian's, then
    Claude on Vercel's. AI Gateway Logs show which credential each request used.
- **Options:** Vercel's keys only; Gemini and Claude both on Vertex AI.
- **Why:** With two vendors on two clouds, a Vertex-wide failure still leaves a working path.
  Claude on Vertex would share the primary's failures and needs Model Garden setup.
- **Consequences:**
  - The Vertex BYOK key is the system's one long-lived Google Cloud credential, limited to the
    Vertex AI User role and stored only in AI Gateway.
  - Gateway budgets don't cap BYOK spend (D23). Requests on Vercel's keys are billed to AI Gateway
    Credits rather than to Meridian's GCP commitment or Anthropic org, and unlike BYOK spend they
    count toward Gateway budgets. The team setting "Fallback to Vercel Keys" turns the retry off,
    at $0.20 per 1,000 BYOK requests.
  - Answers differ by model, so evals run on both (D19).
  - Falling back to Claude sends data outside Google Cloud.

## D6. Data model {#data-model}

- **Choice:** Eight tables: `customers`, `vehicle_models` (specs), `vehicles` (keyed by VIN),
  `telematics_events`, `recalls`, `vehicle_recalls`, `cases` and `case_notes`. The seed holds five
  synthetic stories:
  - a recurring fault (Dana Whitfield)
  - a symptom that matches an open recall (Marcus Bell)
  - a healthy vehicle (Priya Raman)
  - a customer with two vehicles (Jordan Okafor: an Aster EV, and a Kestrel work truck with a
    coolant warning)
  - a fault that returned after its case was closed (Sam Torres)
- **Why:** Specs belong to the vehicle model, so they cache best. The VIN is what advisors already use.
  Recalls give the agent its most valuable connection, and each story doubles as an eval case.

## D7. API shape {#api-shape}

- **Choice:** The API is shaped around the data, not the agent: customer by email, vehicle by VIN
  (with specs and recalls), telematics, cases with notes, create case, add note and close case.
  Errors share one shape, `{ error: { code, message } }`. Express has no auth code, because Cloud
  Run IAM rejects callers before they reach it (D3).
- **Why:** Meridian's API shouldn't change to suit AI, so all AI logic stays on the Vercel
  side.

## D8. Contracts {#contracts}

- **Choice:** The web app keeps its own Zod schemas in `lib/customer/` and validates every
  response.
- **Options:** A shared `packages/contracts`.
- **Why:** In a real deployment another team would own the API, so the web app treats it as an external contract
  and checks it at the boundary. The cost is that shapes are written twice.

## D9. Infrastructure as code {#terraform}

- **Choice:** Terraform defines Google Cloud in `infra/`, with state in a versioned GCS bucket.
  Three things stay outside it: the running image (deployed by GitHub Actions), Postgres grants
  (`infra/sql/grants.sql`) and the Vercel project, because the Vercel Terraform provider needs a
  long-lived token.
  Firewall rules are JSON in `infra/vercel-firewall/`, applied with the Vercel CLI.
- **Why:** The boundary (WIF trust and IAM bindings) is what reviewers question, so it
  should be readable code.

## D10. Cloud Run → Cloud SQL {#db-access}

- **Choice:** The API connects through the Cloud SQL connector with IAM database login. Both run
  in `us-central1`. The database has a public IP with no authorized networks, so only the
  IAM-checked connector can reach it. The API's database user can't change the schema; migrations
  run as the deployer (D13). The production design would use a private IP.
- **Why:** No workload uses a database password. The API and CI log in with IAM, and Terraform
  creates only IAM database users. The one exception was a manual step: D32's first reseed.

## D11. Function region {#function-region}

- **Choice:** `cle1` (Cleveland), set in `apps/web/vercel.json`.
- **Why:** Every dynamic request calls the API in `us-central1` (Iowa), and `cle1` is the closest Vercel
  region. The static shell is still served from Vercel's global edge.
- **Trade-off:** Functions run in one region. If it fails, Vercel reroutes to the next closest.

## D12. Environments {#environments}

- **Choice:** Separate staging and production API services and databases, on one Cloud SQL
  instance. `develop` deploys staging and `master` deploys production. Vercel Preview and
  Development deployments use staging; Production uses production.
- **How it's enforced:** Each environment has its own service accounts. WIF reads the
  environment from the Vercel token, so a preview can only act as the staging caller. Each
  database revokes `CONNECT` from `PUBLIC`.
- **Why:** A preview can never touch production data.

## D13. API pipeline {#pipeline}

- **Choice:** GitHub Actions runs on every push to `develop` or `master`. It builds the image,
  runs `prisma migrate deploy` through the Cloud SQL Auth Proxy, then deploys the new revision. It
  authenticates through a GitHub WIF provider trusted by repository ID, and each branch can
  act only as its own environment's deployer. The web app deploys separately through Vercel's Git
  integration.
- **Options:** Migrations as a Cloud Run Job; Terraform in CI.
- **Why this order:** A failed migration leaves the running revision untouched. Migrations must
  be backward compatible (expand, then contract), because the old revision serves traffic until
  the new one is ready.

## D14. Vehicle page caching {#vehicle-page-caching}

- **Choice:** A static shell, with each panel streamed in independently:

  | Data | Strategy | Tag |
  |---|---|---|
  | Vehicle, specs, recalls | `use cache: remote`, `hours` (`minutes` if not found) | `vehicle:{vin}` |
  | Cases and notes | `use cache: remote`, `minutes`; `updateTag` on save | `cases:{vin}` |
  | Live telematics, agent answers | Not cached (`connection()`); the agent's record reads use the cached fetchers above (D30) | — |
  | Settled telematics windows | `use cache: remote`, `days` (D37) | `telematics:{vin}` |
  | Customer search by email | Not cached, because it runs only in a Server Action, which also keeps emails out of URLs | — |

- **Why the Runtime Cache:** An in-memory cache is per instance, so after a save another instance
  could keep serving old cases. The Runtime Cache is shared within a region and environment. It
  starts empty after each deploy.
- **Accepted staleness:** A change made outside this app, such as a completed recall or new owner
  details entered in Meridian's CRM, can take about an hour to appear. The `hours` profile
  refreshes an entry hourly, but an entry nobody reads can be kept for up to a day.
- **Personal data:** Owner details are cached for up to a day and case text for up to an hour.
  Meridian needs to approve this.
- **Production path:** The CRM would send change events to a route that invalidates the VIN's
  tags.

## D15. Agent {#agent}

- **Choice:** An AI SDK `ToolLoopAgent` behind `POST /api/agent`, shown as a chat on the vehicle
  page.
  - **Scope:** The route supplies the open vehicle, so the model can't choose a VIN.
  - **Limits:** A step cap, `reasoning: "low"`, the last 10 messages and request checks (D27).
  - **Grounding:** It uses only facts from the record or a tool, and gives the date of each fact. It says when data is
    missing, never shows internal IDs, and ends with next steps.
- **No output cap:** Gemini's hidden reasoning counts toward the cap, and at 1,000 tokens answers
  were cut off. Cost is bounded in other ways (D33).
- **Later change:** How data is loaded and how the prompt is built were redesigned in D30.

## D16. Call summary {#call-summary-generation}

- **Choice:** One structured model call (`streamText` with `Output.object`), with the record
  loaded up front. It fills the `case_notes` fields (issue, summary, next steps), plus a subject
  and category for a new case. The advisor edits the draft and presses Save. A Server Action then
  writes the note, marked `AI_DRAFT_EDITED`, and calls `updateTag`. The case picker defaults to
  the case the advisor is viewing, otherwise the newest open case. Refined by D45: only open cases
  are listed, so a closed case in view is never the default.
- **Limits:** Transcripts can be up to 15,000 characters. The call has no tools, so instructions
  hidden in a transcript can't do anything.
- **Options:** Display only, with no save; the agent with its tools; always opening a new case.
- **Risk:** Transcripts are personal data sent to model providers. In production, use Zero Data
  Retention routing and a privacy review.

## D17. Status row {#vehicle-status}

- **Recent faults:** Faults from the last 30 days count as current, because telematics has no
  "cleared" flag. The real fix is that flag in the API.
- **Rendering:** Each status item streams in on its own. The telematics panel and the status
  row share one telematics fetch per request (React `cache()`), so their counts agree.
- **Links:** Fault codes and recalls in the assistant's answers become links only if they appear
  on the page.
- **Later change:** After the move to a shared layout (D41), neither the shared fetch nor this
  link rule still held. D43 records the changes.

## D18. Edge rate limits {#rate-limits}

- **Choice:** Two Vercel Firewall rules, counted per IP over 60 seconds, returning 429: 20 a
  minute for the AI routes and 30 a minute for note saves.
- **Options:** `checkRateLimit()` in the route; a Redis-based limiter; only the Cloud Run limit.
- **Why the edge:** A blocked request never starts a function or calls a model.
- **Limits:** Advisors at a contact center share office IPs, so per-IP limits don't suit
  production. Once Entra ID sign-in exists, limits should count per advisor, using
  `checkRateLimit()` with a `rateLimitKey`. For spend spread across many IPs, the backstop is D23's alerts and Anthropic limit.

## D19. Evals {#evals}

- **Choice:** Vitest, run on demand with `pnpm eval`. The evals run the real agent and call
  summary against staging, through the real boundary, on each model alone, three times per case.
  Grading is deterministic: required facts must be present, and internal IDs, invented fault
  codes, assumed pronouns, promises to the customer and markdown must be absent. There are 10 agent cases and 7
  call-summary cases, including a request for another customer's VIN and a prompt injection.
- **Options:** HTTP requests against the route; recorded fixtures; an LLM judge.
- **What they caught:** Claude guessing pronouns, Gemini omitting driver-safety advice and offering
  a loaner, Claude copying an injected instruction into a note, and a tool loop that added nothing
  (D30).
- **Results (Nov 2026):** The agent scored 30/30 and call summaries 21/21 on both models. The next
  step is running them on release PRs. Later results are in D30, D40 and D44 (the latest).

## D20. API rate-limit keying {#api-rate-limit-keying}

- **Finding:** The API's limit counted per IP, but all traffic arrives from Vercel's shared IPs,
  so every advisor shared one budget of 120 requests a minute.
- **Choice:** Count per calling service account, read from the IAM-verified token, at 1,200 a
  minute per environment. The edge limits people (D18), and the API limits calling systems.
- **Limit:** Counters live in each instance's memory, and Cloud Run runs up to 3 instances (D34),
  so the real ceiling can be up to three times higher. That's acceptable for a backstop.

## D21. Lookup {#lookup-and-layout}

- **Suggestions:** Suggestions come only from the browser: recent vehicles, the six seeded
  vehicles, and hints that update as the advisor types, with no server call. Input with a digit
  is treated as a VIN: the hint counts characters toward 17 and flags I, O or Q, anything other
  than letters and digits, or more than 17 characters. Input with an "@" is labelled as an email,
  with no format check. Searching the server by prefix would let anyone list customers on a public prototype,
  so it belongs behind sign-in.
- **Recents:** The last five vehicles are kept in `localStorage`, never with emails.
- **Units:** Units are read from the end of each telematics message, such as "(miles)", "(%)" or
  "(°C)". The proper fix is a `unit` field in the API.
- **Layout:** Ask and Call summary are tabs that stay mounted, so neither loses its state.

## D22. Save failures {#save-feedback}

- **Finding:** A failed save threw an error in the browser, and the error page wiped the
  advisor's edits.
- **Choice:** Edits always stay in the form, and the error says what happened (404, 400 with the
  reason, or 429). A new case and its first note are written in one transaction (`POST /cases`),
  so a failed save leaves nothing behind, and a retry repeats the whole save rather than creating a
  case with no note.
- **Later change (D46):** A save can also fail only from the browser's point of view: the API
  writes the note but the response is lost. A retry then wrote the note twice, or opened a second
  case. Each AI draft now carries an ID, and the API writes it once. The draft itself is kept in
  `sessionStorage`, so a reload no longer loses it.

## D23. Spend alerts {#spend-alerts}

- **Choice:** A $25/month budget alert on two Google Cloud billing services, Vertex AI and the
  Gemini API (`infra/budget.tf`), and a $25/month hard limit on Anthropic. The app calls Gemini
  only through Vertex AI, but the repo doesn't show which of the two services bills that usage,
  so the budget covers both.
- **Options:** A lower Vertex quota; a budget that unlinks billing, which would stop every
  workload in the project.
- **Detail:** The budget measures spend before credits. Otherwise it would read $0 and never
  alert.
- **Limit:** Google Cloud budgets alert but don't stop spending, and they lag by hours. In
  production, use quotas per model and alerts to on-call.

## D24. Tests {#tests}

- **Choice:** API tests run against a real Postgres through the real app, covering contracts,
  privacy, bad input, ownership and rate limits. About 100 web unit tests cover parsing, request
  checks and save errors. CI runs both on every PR, with no secrets. Model behavior is left to the
  evals.
- **Options:** Mocking Prisma; component tests; Playwright.
- **Safety:** The API tests refuse any database whose name doesn't end in `_test`, because the
  seed deletes rows.

## D25. Note ownership {#note-ownership}

- **Finding:** A crafted Server Action request could attach a note to another customer's case.
- **Choice:** The API checks that the case belongs to the note's VIN, which protects every client,
  not just this one.
- **Rollout:** The VIN is a new required field on note writes. Both sides shipped together in one
  release, though the web app could safely have gone first: the old API dropped unknown fields, so
  sending the VIN early was harmless. Shipping the API first would break every caller that
  doesn't send the VIN yet, including the React app (D7). The safe order for the React app is
  expand, then contract: the API accepts an optional VIN and checks it when present, every caller
  starts sending it, and then the API requires it.

## D26. Non-support transcripts {#junk-transcripts}

- **Finding:** Given a transcript with nothing to summarize, the model presented the vehicle
  record as if it were the call.
- **Choice:** Prompt rules plus a `callType` field (`vehicle_issue`, `other` or
  `no_conversation`). Any type other than `vehicle_issue` shows a warning in the review form. The
  field isn't saved, but it gives the evals something exact to check.
- **Borderline calls (Nov 17):** A wrong number can fairly be read as `other` or
  `no_conversation`. Both show a warning, so the `no_conversation` wording ("Nothing to summarize
  from this call") fits silence, noise and wrong numbers alike. The prompt is unchanged, because
  prompt edits have cost eval regressions before (D40).
- **Length limits:** The draft schema describes length limits to the model but doesn't reject a
  draft that exceeds them, so an over-long draft doesn't vanish in the browser. Instead, the save action names the field that's
  too long.

## D27. Agent request checks {#agent-request}

- **Finding:** The route accepted any role, any message part type and empty questions.
- **Choice:** An allow-list in `lib/ai/agent-request.ts`: `user` and `assistant` roles, text-only
  user messages, up to 2,000 characters per question and 80,000 across the last 10 messages.
  Rejected requests get a 400 or 413 before any model call.
- **Limit:** A caller can forge earlier assistant turns, but only within their own session.

## D28. Current state {#current-state}

- **Today:** Meridian's console is a React app built with Vite, served from Cloud Storage
  behind Cloud CDN, with Microsoft Entra ID sign-in. The browser calls REST services on Cloud Run
  in `us-central1`. Cloud Build uploads each release to the bucket, and there is one shared
  staging environment. About 80 advisors work in North America, Europe and the Middle East.
- **Other starting points I considered:** Next.js already self-hosted on GKE; the same app on VMs.
- **Why this one:** This is how a typical mid-market company runs an internal React app, and its problems
  are ones a platform and framework solve: slow screens far from Iowa, one shared staging, APIs
  exposed to the browser, and nowhere to run an assistant.
- **Alternative Meridian weighed:** Running Next.js on Cloud Run, which would mean owning scaling,
  the CDN setup, previews and rollbacks.
- **Honest limit:** Functions run in one region next to the data (D11). Advisors abroad gain from
  the edge-served shell and streamed panels, not from faster data.

## D29. Error states {#error-states}

- **Findings:** One failing panel replaced the whole page, the lookup had no error boundary, an
  invalid draft vanished, and the chat had no retry.
- **Choice:** Each panel catches its own failure and offers Retry (`lib/load-panel.ts`, using
  `unstable_rethrow` so prerendering still works). The lookup shows errors inline. Both AI routes
  share one error shape, and a failed answer offers Try again.
- **Later change:** D43 gives the vehicle header the same Retry card.

## D30. Record up front {#agent-context}

- **Finding:** Both models called all three of the agent's tools (vehicle, cases and telematics)
  for every question, so the first round trip was always the same and only added latency.
- **Choice:** The route loads the vehicle, its cases and the 20 newest telematics events from the
  page's cached fetchers, and sends them as a second system message after a static prompt that
  providers can cache.
  - **Shaped for the model:** No internal IDs, dates already formatted, and repeat counts
    computed in code.
  - **One tool:** `getTelematics`, for older history, with a step cap of 3.
  - **History:** Earlier tool results sent by the browser are dropped, since they could be forged.
  - **AI Gateway:** `caching: 'auto'`, and a `feature:` tag per route for spend reporting.
- **Options:** Forcing the first step to call the tools, which Anthropic's API doesn't allow with
  extended thinking on;
  keeping the loop.
- **Results:** Gemini scored 30/30 with a 2.6 s median (down from 4.7 s). Claude scored 30/30 (up
  from 29/30) at 4.0 s (down from 5.4 s), using about 20% fewer tokens.

## D31. Case view {#case-view}

- **Choice:** A case page at `/vehicles/[vin]/cases/[caseId]`, showing status, an overdue banner,
  a quick note, Close with a required resolution, the activity thread and related faults.
  Meridian's schema doesn't change. The assistant lives in the vehicle layout, so the chat and any
  draft survive moving between pages.
  - **Close:** `POST /cases/:id/close`, with the same ownership check as D25. It returns 409 if
    the case is already closed.
  - **Overdue:** A case is overdue when it's open with no note for 5 business days. That's the support
    desk's policy rather than data Meridian's API holds, so the web app computes it.
  - **Related faults:** Coded faults from the 7 days before the case opened, labelled as matched
    by date rather than by a recorded link.
- **Cut:** Escalation, case numbers, owner, priority and dealer repairs. Each needs advisor
  identity, a migration or another Meridian system.
- **Later changes:** D40 added case numbers, D41 moved the page to `cases/[number]`, D42 changed
  how faults match cases, and D44 removed the overdue rule and replaced related faults with fault
  history.

## D32. Release versions {#release-versions}

- **Choice:** Date-based versions, such as branch `release/26.11.15.1` and tag `v26.11.15.1`. A
  date tells support which build is live, and this is an app, not a library. `package.json`
  versions stay semver.
- **First release:** Production was reseeded once by hand through the Auth Proxy, logged in as
  Cloud SQL's built-in `postgres` user with a temporary password set outside Terraform. Afterwards
  the password was rotated to a random value that isn't stored. CI never reseeds production.

## D33. Cost per run {#cost-per-run}

- **Choice:** Use the cost AI Gateway returns with every response. Its `marketCost` is the list
  price of the tokens; `cost` is 0 with BYOK. `lib/ai/usage.ts` logs one
  `ai_usage` line per answer, and the eval report shows averages.
- **Options:** A price table kept in the repo; dashboard totals only.
- **Measured (Nov 2026, per answer):**

  | | Gemini 3.8 Flash | Claude Sonnet 5.5 |
  |---|---|---|
  | Agent answer | $0.0019–0.0020 | $0.0042–0.0059 |
  | Call summary | $0.0019 | $0.0039–0.0058 |

  That's about $2 per 1,000 answers on Gemini. The fallback costs two to three times as much.
  Reporting tags add $0.000075 per request; they're kept because they split spend by feature.

## D34. Concurrency {#concurrency}

- **Today:** Fluid compute in `cle1`. Cloud Run runs up to 3 instances per environment, each
  handling up to 80 concurrent requests. One `db-f1-micro` Cloud SQL instance, with about 25
  connections, holds both environments' databases.
- **Finding:** At 5 connections per instance, full scale would need 30 (3 instances × 5
  connections × 2 environments).
- **Choice:** A pool of 4 per instance, 24 in total. A `Decision (D34)` comment marks both
  settings: the pool size in `services/vehicle-api/src/db.ts` and `max_instance_count` in
  `infra/cloud-run.tf`.
- **Fit:** 80 advisors generate a few requests a second at peak, well within these limits. The
  database's connection limit is the real ceiling; beyond it, use a larger instance or a
  connection pooler.

## D35. Rollout {#rollout}

- **Today:** Every branch gets a Preview Deployment against staging (D12). Merging a `release/*`
  branch to `master` deploys the production API and web app (D32). Rollback is Instant Rollback on
  Vercel and the previous revision on Cloud Run. Migrations are expand-then-contract. When a change spans
  both sides, the API ships first, unless it starts requiring something callers don't send yet
  (D25).
- **For- **For Meridian:** An incremental migration, following Vercel's guide. Meridian's domain points to
  Vercel from the start. Next.js fallback rewrites send every path the new app doesn't have yet to
  the React app, so advisors see one address. Each rebuilt screen goes first to a pilot group,
  chosen by Routing Middleware (`proxy.ts`) from the advisor's Entra ID group and a flag in Global
  Config, then widens to every advisor. Rolling back a screen is a flag change, with no redeploy.
  The React app retires when nothing falls back to it. Every release uses Rolling Releases and
  Skew Protection.
- **Options:** A pilot group on the new app, then everyone switching at once when every screen is
  done; Vercel Microfrontends.
- **Why:** Each screen's value reaches every advisor as soon as it's ready, rollback is per screen,
  and there is no single switchover where problems surface late.
- **Trade-offs:** Links between the two apps load a full page, so both apps' navigation must
  match. Group flags need Entra ID sign-in at the edge, which the prototype doesn't have yet.

 Warm API {#warm-api}

- **Measured:** With staging at zero instances, the first vehicle page took 6.8 s. About 3.8 s
  was Cloud Run starting up; the rest was a cold function, the token exchange and an empty cache.
  Production, with one instance running, took 0.46 s.
- **Choice:** One minimum instance on production; staging still scales to zero. It costs about
  $10/month while idle (an estimate) and stays within D34's connection limit.
- **Options:** A scheduled `/health` ping.
- **Doesn't fix:** The Vercel side after a deploy: an empty Runtime Cache, and one token exchange
  per new instance.

## D37. Past telematics {#telematics-windows}

- **Finding:** Related faults were filtered from the 50 newest events (the case view's telematics
  read at the time; the overview reads 20), so an older case's week came back empty.
- **Choice:** The API accepts `from`, `to` and `codedOnly` on telematics, and the case page reads
  one window per case. A window that ended more than 24 hours ago is cached for days; a newer one
  is read fresh. The 24 hours allows for vehicles that upload late after being offline.
- **Options:** Caching the live feed briefly; fetching only new events.
- **Production path:** The ingest pipeline would invalidate `telematics:{vin}` when a late event
  arrives.

## D38. Seeded case activity {#seed-activity}

- **Choice:** Note threads only where a story (D6) needs one, with no schema change. Dana's three
  cases hold 2, 3 and 1 notes, ending with a buyback request sent to the review team and not yet
  answered. Marcus's open case holds 2 notes that never mention the recall, a software update or
  version 3.2.0, because linking the symptom to MR-24-117 is the assistant's job, and an eval
  checks it.
- **Left alone on purpose:** Priya has no cases (the empty state), Jordan's truck has a fault with
  no case, and Sam keeps one note.
- **Options:** One note per case, as the seed had before; a thread on every story.
- **Why:** Case history and the case view need real threads to show. The assistant reads these
  notes, so they follow the rules the evals apply to its answers: first names, no pronouns, no
  promises, no instructions to the assistant and no case IDs.

## D39. Suggested questions {#assistant-suggestions}

- **Choice:** The Ask tab suggests questions written for the vehicle in view, from six fixed
  rules: the fault the status row shows (recurring or first time), open cases, the first open
  recall, what to tell the customer, a status summary, and what changed since the last contact.
  The last rule applies only when there's no fault, so it never appears with the fault rule, and
  a vehicle gets at most five questions. The vehicle layout starts loading them without waiting and passes the
  promise to the chat, which reads it with React's `use()` inside its own `<Suspense>`. The
  question box renders at once; only the suggestion rows wait.
- **Options:** Fetching suggestions from the browser after the page loads, which costs an extra
  telematics call and a loading flash; rendering them on the server as a slot, which leaves the
  follow-up chips needing a second copy of the list.
- **Why:** Rules cost nothing and are ready with the record. The layout uses the page's own
  fetchers, cached or shared per request, so suggestions add no calls to Google Cloud. If any
  read fails, the chat falls back to three general questions.
- **Limit:** Layouts don't re-render on client navigation, so suggestions reflect the record as
  the advisor entered the vehicle, until a save refreshes the page.

## D40. Case numbers and case actions {#case-numbers}

- **Choice:** The API gains what an advisor needs to finish a call. Every change to the schema
  only adds, so the running revision keeps working during a deploy (D13).
  - **Case numbers:** An identity column, `number`, starting at 24101, shown as `CS-{number}`.
    `GET /vehicles/:vin/cases/:number` reads one case. The model now sees case numbers and may
    cite them. Internal IDs stay hidden, so this narrows what D15 and D30 count as an internal
    ID.
  - **New writes:** `reopen` with a reason, and a note's `remove` and `restore`. They follow the
    existing pattern: `POST /cases/:id/...` with the VIN in the body, and a 404 for another
    vehicle's case or note, as in D25. Reopening clears the resolution and keeps the reason and
    the old resolution as a rep note. A 409 goes to a note that belongs to a different case, a
    close on a closed case, a reopen on an open case, and a removal of a note already removed.
  - **Removing a note** sets `removedAt`. Case reads leave removed notes out, so the assistant
    never reads them, and restore (Undo) brings a note back unchanged.
  - **Rep notes**, which an advisor writes directly rather than from an AI draft, need only a
    summary; `issue` is nullable. AI-drafted notes still need all three
    fields.
  - **Vehicle read:** Adds the owner's phone for the contact buttons. The model never gets it.
- **Options:** A number generated in the web app from the case's cuid (its internal ID); moving every case route under
  `/vehicles/:vin/cases/:number`; deleting notes; placeholder text for a rep note's issue.
- **Why:** Advisors read case numbers aloud, and the number belongs to the system of record, so
  the React screens show the same one. Keeping the existing routes leaves the React app's calls
  untouched (D7). A removed note stays for Undo and for audit.
- **Why identity, not SERIAL:** Postgres lets anyone who can insert into the table use an identity
  column's sequence. A SERIAL sequence needs its own grant, which `infra/sql/grants.sql` doesn't
  give the API's user, so inserts would fail on staging and production.
- **Checks:** API tests for each write and refusal, a seeded removed note that no read returns,
  and an eval rule that no answer or draft mentions it.
- **Rollout:** The API ships before the web app, which now expects `number` (D35).
- **Results (Nov 16, 2026, 3 runs per case, after a reseed):** Gemini 30/30 and 21/21; Claude 29/30
  and 20/21. No answer or draft mentioned the removed note, and case numbers appeared without
  tripping the internal-ID check. Claude's two misses were intermittent and unrelated to case
  numbers: one call summary mentioned the transcript's injected request, though it didn't follow
  it (3/3 on a rerun), and one tire-pressure answer called `getTelematics` for older history (6/6
  with both the original prompt and the case-number prompt described below).
- **Prompts unchanged (Nov 16):** A line in each prompt inviting case numbers ("or by case number,
  such as CS-24117") made Claude slip on pronouns: the Marcus call summary failed 5 of 9 runs, and
  two agent cases 4 of 18, against 6/6 and 12/12 with the original prompts. Both prompts went back
  to their earlier wording, which forbids only internal IDs. The record still gives each case's
  number, and answers cite them without being told to.

## D41. Vehicle routes {#vehicle-routes}

- **Choice:** `vehicles/[vin]/layout.tsx` owns the header (title, VIN, New case, customer, status
  row, open-recall banners) and the assistant. D44 later moves New case to the Cases panel. Each route replaces only the left column below it:
  the overview, `cases/[number]` and `cases/new`. Refines D31: case URLs use the number advisors
  say (`/cases/24117`), and `cases/[caseId]` is gone.
  - **Caching:** The case page reads its case from the cached case list (`cases:{vin}`, D14),
    which every write clears. Telematics stays uncached.
  - **Chips:** The layout doesn't re-render on client navigation, so the header chips that depend
    on the page, such as the open-case and fault chips, are small client components that read the
    pathname. The open-case chip marks itself
    current on its own case; the fault chip scrolls to the fault's newest telematics row on the
    overview and to its fault history on a case page.
  - **Breadcrumb trail:** The path the advisor took within this vehicle, kept in the layout's
    state rather than the URL. Back, or a crumb, returns to an earlier step; a new VIN starts a new
    trail; a page opened directly shows the overview and the current page. At most three steps
    show, with older ones behind "…". The new-case form never stays in the trail: the page after
    it, usually the case it opened, takes its place, and the redirect replaces the browser's
    history entry, so Back skips the submitted form too (Nov 17).
  - **New case:** A Server Action writes the case and its first rep note in one call (D22), clears
    the case list's cache and opens the new case.
- **Options:** A per-case cached read with its own tag, using `GET /vehicles/:vin/cases/:number`;
  keeping the trail in `sessionStorage` so it survives a reload.
- **Why:** The header and assistant stay mounted, so the chat thread and an unsaved draft survive
  every move. A per-case read buys nothing yet, because a case page needs the vehicle's whole case
  list for its fault history. The per-case read becomes the right approach once a vehicle has
  hundreds of cases, and the endpoint already exists. The trail stays out of the URL so a shared link opens the case, not
  someone's route to it.
- **Accepted:** A case number that doesn't exist shows the not-found view with a 200 status,
  because the static shell has already been sent. The vehicle page behaves the same way.

## D42. Faults linked to cases {#fault-case-links}

- **Choice:** One helper, `matchFaultsToCases` in `lib/cases.ts`, decides which fault led to which
  case: a case's fault is the newest coded event in the 7 days before the case opened, and a
  fault links to the earliest case, opened 0 to 7 days after the fault, whose matched fault has
  the same code. The telematics panel
  links each fault row to its case ("CS-24117 opened 2 days later"), and each case row shows its
  fault code. The case view's fault history uses the same helper.
- **Refines D31:** The page no longer says the link is a match by date. The app should read like
  a tool for advisors rather than explain its own matching, so the rule lives in the helper's doc
  comment and here.
- **Rendering:** Each panel now reads the other's data: telematics reads the cached cases, and
  cases read the request's telematics snapshot (React `cache()`, so no extra call). If the other
  source fails, the panel still shows, without links or codes. The cost is that the cases panel
  waits for telematics before it streams in.
- **Options:** Showing the rule on screen; a real case-to-fault link in Meridian's API, which
  is the production path.
- **Limit:** Matching runs over the 20 newest events on the overview, so on a long history an old
  case may show no code. The case view reads settled windows per case (D37).

## D43. Layout freshness {#layout-freshness}

- **Finding:** Moving the header and assistant into the `[vin]` layout (D41) left three claims
  untrue. Next.js doesn't re-render a shared layout on client navigation
  ([docs](https://nextjs.org/docs/app/getting-started/layouts-and-pages)), and an `error.tsx` doesn't
  cover the layout beside it.
  - The status row and the telematics panel shared one fetch (D17), but after overview → case →
    overview only the panel is fetched again.
  - Fault codes in answers became links only if their row was on the page when the answer
    rendered (D17). The chat now outlives the page, and older rows sit in a collapsed list.
  - A failed vehicle read in the header reached the root error page, which replaced the whole
    screen with the lookup's message (D29).
- **Choice:**
  - **Accepted:** The layout's reads (header, status row, suggestions, the call summary's case
    list) reflect the record as it was when the advisor opened the vehicle. A save, Retry, or a reload refreshes them. The page's
    own panels are fresh on every navigation. Extends D39's limit to the whole header.
  - **Fault links:** A fault code is always a link and finds its row when clicked. On the
    overview it flashes the code's newest row, expanding the list if needed. If the code isn't
    among the newest events, it flashes the telematics panel instead. Elsewhere it opens the
    overview first.
    Recall codes keep the render-time check, because their banners are in the layout.
  - **Header failure:** The header catches its own failure and shows a Retry card, as the panels
    do (D29). The specs card reads the same record; when that read fails, it shows no error of its
    own and leaves the explanation to the header's Retry card.
- **Options:** Refreshing the layout on every navigation, which costs a telematics call and a
  token exchange per click; moving the status row into each page, which undoes D41; keeping
  answer links in sync with the page by watching the DOM.
- **Why:** The header and the panel disagree only if telematics arrives while the advisor is
  moving within one vehicle, and the panel is the one they read. Resolving on click costs nothing
  until the advisor clicks.
- **Also corrected:**
  - D14's table now says that only the agent's answers are uncached. Its record reads use the
    cached fetchers (D30).
  - Customer search runs only in a Server Action, which is never cached, so a `connection()` call
    there did nothing and is gone. Running in a Server Action also keeps emails out of URLs.
  - No `generateStaticParams`: prerendering the seeded vehicles would put owner details in static
    HTML, and the real fleet is unbounded. One shell serves every VIN.
  - `partialPrefetching`: a link prefetches its route's shell once, shared by every link to that
    route (one for all VINs), so a click shows the layout and skeletons at once while the data
    streams ([docs](https://nextjs.org/docs/app/guides/prefetching#partial-prefetching)).
- **Client components:** Only for browser state, the pathname or events. Data reaches them from
  the server as props or slots, and the leaf is kept small: `AssistantPanel` is now a server
  component around the client tabs, and `PanelUnavailable` puts only its Retry button on the
  client.

## D44. Case view and actions {#case-actions}

- **Choice:** The case view carries every write an advisor needs to finish a call. Each is one
  call to the API (D40), followed by clearing the case list's cache.
  - **Header:** `CS-{number}`, status and subject; Category, Opened, Last contact and Notes; Close
    case on an open case, Reopen case on a closed one, each as an inline form that requires a
    resolution or a reason.
  - **Activity,** newest first: notes, the opening, a close with its resolution, and "Reopened"
    for the rep note the API writes when a case reopens.
  - **Removing a note** has no confirmation dialog. The note is replaced at once by "Note removed",
    with Undo for 8 seconds. If the request fails, the note comes back with the error.
  - **Quick note:** a summary only. Transcripts go through Call summary.
  - **Fault history** replaces related faults: every occurrence of the case's matched fault (D42),
    newest first, with the case each one led to. The case in view is marked rather than linked. A
    case with no matched fault shows none.
- **Refines D31:** No overdue rule. It was the support desk's policy, not data Meridian's API
  holds, and with no advisor identity or escalation states, it only labelled cases without
  changing what anyone did. Escalation and overdue rules are a later phase. "New case" lives in the Cases panel only,
  not the vehicle header.
- **Options:** Keeping overdue as built; a confirmation dialog before removing a note.
- **Why Undo, not a dialog:** Removing is rare and reversible, so a dialog would slow every
  intentional removal to guard against a rare mistake. The note stays in the database, marked removed.
- **Limit:** The "Note removed" marker lives in the page. After a reload the removed note simply
  isn't there.
- **Results (Nov 16, 3 runs per case):** agent 30/30 and call summaries 21/21 on both models, with
  case numbers cited throughout and no mention of the removed note.

## D45. Call summary target {#call-summary-target}

- **Choice (refines D16):** "Save to" lists the vehicle's open cases, newest first, plus New case.
  The default is the case in view if it's open, otherwise the newest open case, otherwise New
  case. The button names the target: "Save to CS-24117" or "Save to new case".
- **Options:** Closed cases listed below a divider; "Reopen and save" when the case in view is
  closed.
- **Why:** A note on a closed case doesn't appear anywhere that shows open cases (status row,
  overview), so nobody follows it up. Reopening on the case view (D44) is one click and records why the case came back.
- **Limit:** The list is read when the advisor opens the vehicle (D43). Case writes refresh it. If
  a case is closed after the list was read, the API still accepts a note on it, so nothing is
  lost, but the note would sit on a closed case.

## D46. Repeat-safe save and unsaved drafts {#repeat-safe-save}

- **Finding:** Two gaps in the call summary save (D16, D22).
  - **Repeated save:** If the API writes the note but the response never reaches the browser
    (timeout, dropped connection, a 500 after the commit), the advisor sees "didn't go through" and
    retries. The retry writes a second copy of the note, or on New case a second case with its own
    CS number. The Save button is already disabled while the save runs, so double-clicks weren't
    the problem.
  - **Reload:** The transcript, draft and edits lived only in React state. Moving between pages
    kept them (D31), but a reload or crashed tab lost them.
- **Choice, repeated save:** Each draft gets an ID (`crypto.randomUUID()`) in the browser when it
  finishes streaming. The ID goes through the Server Action to the API, which stores it in
  `case_notes.draftId` under a unique index.
  - **Repeat, same target:** The database refuses the second insert (Prisma `P2002`). The API
    answers 200 with the note already saved, and for New case with the case that draft opened.
    The browser shows "Saved to CS-…" as if the first response had arrived.
  - **Repeat, other target:** If the advisor switched case before retrying, the API answers 409.
    The form says the draft is already saved to another case and refreshes Case history, so it
    shows there.
  - **New case:** The duplicate note fails the whole nested create, so no second case is opened.
    It does use up a case number, so CS numbers can skip one.
  - **Contract:** `draftId` is optional on the API, so a web deploy that doesn't send it keeps
    working (D13). Rep notes and seeded notes have none; Postgres allows many NULLs in a unique
    column. The web app always sends it for AI drafts.
- **Choice, unsaved draft:** `sessionStorage`, one entry per VIN (`vs:call-summary:{vin}`), holding
  the transcript, the generated draft, the advisor's edits and picked case, and the draft ID. It's
  cleared after a successful save. Entries are checked with Zod when read, and blocked storage
  just means no restore. The form reads storage only after hydration, so the server-rendered HTML
  never depends on it.
- **Options:**
  - **Repeated save:** An `Idempotency-Key` header with a table of stored responses (the Stripe
    pattern), which covers every write but adds a table, middleware and an expiry policy;
    matching on content within a time window, which is a guess that can block a real second note.
  - **Unsaved draft:** `localStorage` with a 24-hour expiry, which survives a crash but keeps
    transcripts on shared machines; server-side drafts, which need advisor sign-in (out of scope).
- **Why:**
  - **ID made in the browser:** An ID made on the server would be new on every retry, so it
    couldn't recognize one.
  - **Database index:** The guarantee holds even when two requests race, which a check in
    application code can't promise.
  - **Storing the ID with the draft:** A save after a reload is still recognized as a repeat.
  - **`sessionStorage`:** Transcripts carry names and phone numbers. It covers a reload and is
    gone when the tab closes, in line with D21 keeping emails out of browser storage.
- **Accepted:**
  - The first write wins: edits made between a lost-response save and its retry aren't saved. The
    success message links to the note as saved.
  - A crash or a second tab starts with an empty form, and a reload mid-stream keeps the
    transcript but not the half-written draft.
  - Only the call summary is covered. The quick rep note and the New case form can repeat the same
    way, and would take the same `draftId` field if needed.
- **Production path:** Server-side drafts once advisors sign in, and an idempotency key on every
  write as Meridian's API grows.
