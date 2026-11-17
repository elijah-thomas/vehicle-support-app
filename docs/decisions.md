# Decisions

The architectural decisions behind this build, numbered in the order they were made. Where one
lands in code, a `Decision (Dnn)` comment marks the line.

## Index

- **Scenario:** [D1](#scenario) Scenario · [D28](#current-state) Current state ·
  [D4](#primitives) Vercel primitives
- **Boundary:** [D2](#gcp-backend) GCP backend · [D3](#boundary-auth) Auth across the boundary ·
  [D7](#api-shape) API shape · [D8](#contracts) Contracts · [D10](#db-access) Cloud Run → Cloud
  SQL · [D11](#function-region) Function region · [D34](#concurrency) Concurrency ·
  [D36](#warm-api) Warm API · [D37](#telematics-windows) Past telematics
- **Rendering:** [D14](#vehicle-page-caching) Vehicle page caching · [D17](#vehicle-status)
  Status row · [D29](#error-states) Error states · [D31](#case-view) Case view ·
  [D21](#lookup-and-layout) Lookup
- **AI:** [D5](#models) Models and failover · [D15](#agent) Agent · [D30](#agent-context) Record
  up front · [D16](#call-summary-generation) Call summary · [D26](#junk-transcripts) Non-support
  transcripts · [D33](#cost-per-run) Cost per run · [D19](#evals) Evals ·
  [D39](#assistant-suggestions) Suggested questions
- **Data integrity:** [D6](#data-model) Data model · [D25](#note-ownership) Note ownership ·
  [D22](#save-feedback) Save failures · [D38](#seed-activity) Seeded case activity ·
  [D40](#case-numbers) Case numbers and case actions
- **Release path:** [D9](#terraform) Terraform · [D12](#environments) Environments ·
  [D13](#pipeline) API pipeline · [D35](#rollout) Rollout · [D32](#release-versions) Versions ·
  [D24](#tests) Tests
- **Protection and spend:** [D18](#rate-limits) Edge rate limits · [D20](#api-rate-limit-keying)
  API rate limit · [D27](#agent-request) Agent request checks · [D23](#spend-alerts) Spend alerts

---

## D1. Scenario {#scenario}

- **Choice:** Meridian Motors (fictional) is rebuilding its advisors' support console, a React
  app on Google Cloud, in Next.js on Vercel, one screen at a time. The vehicle workspace moves
  first and gains an AI assistant. The API and database stay on Google Cloud.
- **Options:** A new Vercel-hosted assistant beside the existing app; a full rebuild at once; a
  screen-by-screen rebuild.
- **Why:** The scenario comes from a support tool I worked on. Advisors piece together a
  vehicle's history from several screens, and one workspace with an assistant removes that work.
  Rebuilding one screen at a time lets a pilot group validate each screen before everyone
  switches (D35).

## D2. GCP backend {#gcp-backend}

- **Choice:** Express on Cloud Run with Cloud SQL Postgres. The API owns the Prisma schema.
- **Options:** Cloud Run with Firestore; an external Postgres (Neon).
- **Why:** It's a realistic system of record in the customer's cloud. The API is the only path to
  the database, and Vercel never connects to Postgres.

## D3. Authenticating across the boundary {#boundary-auth}

- **Choice:** Vercel's OIDC token is exchanged through WIF for a Google ID token, which Cloud Run
  IAM checks. The ID token is cached per function instance for about an
  hour.
- **Options:** A shared API key, which is a long-lived secret to leak and rotate.
- **Why:** No secret is stored, access is scoped per Vercel project and environment (D12), and
  anonymous calls get a 403. GitHub Actions deploys the same way (D13).
- **Verified:** It works end to end from a Vercel deployment, including inside a `"use cache"`
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

- **Choice:** Gemini 3.8 Flash on Vertex AI first (BYOK, billed to Meridian's GCP commitment),
  then Claude Sonnet 5.5 on Anthropic (BYOK), then Vercel's keys through AI
  Gateway's automatic retry. `only: ["vertex", "anthropic"]` keeps each model on the provider that
  bills for it.
- **Options:** Vercel's keys only; Gemini and Claude both on Vertex AI.
- **Why:** With two vendors on two clouds, a Vertex-wide failure still leaves a working path.
  Claude on Vertex would share the primary's failures and needs Model Garden setup.
- **Consequences:** The Vertex BYOK key is the system's one long-lived credential, limited to the
  Vertex AI User role and stored only in AI Gateway. Gateway budgets don't cap BYOK spend (D23). Answers differ by model, so evals run on both (D19). Fallback sends data outside
  Google Cloud.

## D6. Data model {#data-model}

- **Choice:** Eight tables: `customers`, `vehicle_models` (specs), `vehicles` (keyed by VIN),
  `telematics_events`, `recalls`, `vehicle_recalls`, `cases` and `case_notes`. The seed holds five
  synthetic stories: a recurring fault, a symptom that matches an open recall, a healthy vehicle,
  a customer with two vehicles, and a fault that returned after its case was closed.
- **Why:** Specs belong to the model, so they cache best. The VIN is what advisors already use.
  Recalls give the agent its most valuable connection, and each story doubles as an eval case.

## D7. API shape {#api-shape}

- **Choice:** The API is shaped around the data, not the agent: customer by email, vehicle by VIN
  (with specs and recalls), telematics, cases with notes, create case, add note and close case.
  Errors share one shape, `{ error: { code, message } }`. Express has no auth code, because Cloud
  Run IAM rejects callers before they reach it (D3).
- **Why:** The customer's API shouldn't change to suit AI, so all AI logic stays on the Vercel
  side.

## D8. Contracts {#contracts}

- **Choice:** The web app keeps its own Zod schemas in `lib/customer/` and validates every
  response.
- **Options:** A shared `packages/contracts`.
- **Why:** In reality another team owns the API, so the web app treats it as an external contract
  and checks it at the boundary. The cost is that shapes are written twice.

## D9. Infrastructure as code {#terraform}

- **Choice:** Terraform defines Google Cloud in `infra/`, with state in a versioned GCS bucket.
  Three things stay outside it: the running image (deployed by GitHub Actions), Postgres grants
  (`infra/sql/grants.sql`) and the Vercel project, whose provider needs a long-lived token.
  Firewall rules are JSON in `infra/vercel-firewall/`, applied with the Vercel CLI.
- **Why:** The boundary (WIF trust and IAM bindings) is what reviewers question, so it
  should be readable code.

## D10. Cloud Run → Cloud SQL {#db-access}

- **Choice:** The API connects through the Cloud SQL connector with IAM database login, in
  `us-central1`. The database has a public IP with no authorized networks, so only the
  IAM-checked connector can reach it. The API's database user can't change the schema; migrations
  run as the deployer (D13). The production design would use a private IP.
- **Why:** No database password exists.

## D11. Function region {#function-region}

- **Choice:** `cle1` (Cleveland), set in `apps/web/vercel.json`.
- **Why:** Every dynamic request goes to `us-central1` (Iowa), and `cle1` is the closest Vercel
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
  | Live telematics, agent | Not cached (`connection()`) | — |
  | Settled telematics windows | `use cache: remote`, `days` (D37) | `telematics:{vin}` |
  | Customer search by email | Not cached; a Server Action, so no email appears in a URL | — |

- **Why the Runtime Cache:** An in-memory cache is per instance, so after a save another instance
  could keep serving old cases. The Runtime Cache is shared within a region and environment. It
  starts empty after each deploy.
- **Accepted staleness:** A change made in the CRM, such as a completed recall or new owner
  details, can take about an hour to appear.
- **Personal data:** Owner details are cached for up to a day and case text for up to an hour.
  Meridian needs to approve this.
- **Production path:** The CRM would send change events to a route that invalidates the VIN's
  tags.

## D15. Agent {#agent}

- **Choice:** An AI SDK `ToolLoopAgent` behind `POST /api/agent`, shown as a chat on the vehicle
  page.
  - **Scope:** The route supplies the open vehicle, so the model can't choose a VIN.
  - **Limits:** A step cap, `reasoning: "low"`, the last 10 messages and request checks (D27).
  - **Grounding:** It uses only facts from the record or a tool, with dates. It says when data is
    missing, never shows internal IDs, and ends with next steps.
- **No output cap:** Gemini's hidden reasoning counts toward the cap, and at 1,000 tokens answers
  were cut off. Cost is bounded in other ways (D33).
- **Later change:** How data is loaded and how the prompt is built were redesigned in D30.

## D16. Call summary {#call-summary-generation}

- **Choice:** One structured model call (`streamText` with `Output.object`), with the record
  loaded up front. It fills the `case_notes` fields (issue, summary, next steps), plus a subject
  and category for a new case. The advisor edits the draft and presses Save. A Server Action then
  writes the note (`AI_DRAFT_EDITED`) and calls `updateTag`. The case picker defaults to the case
  the advisor has open, otherwise the newest open case.
- **Limits:** Transcripts can be up to 15,000 characters. The call has no tools, so instructions
  hidden in a transcript can't do anything.
- **Options:** Display only, with no save; the agent with its tools; always opening a new case.
- **Risk:** Transcripts are personal data sent to model providers. In production, use Zero Data
  Retention routing and a privacy review.

## D17. Status row {#vehicle-status}

- **Recent faults:** Faults from the last 30 days count as current, because telematics has no
  "cleared" flag. The real fix is that flag in the API.
- **Rendering:** Each status item streams in on its own. The panel and the row share one
  telematics fetch per request (React `cache()`), so their counts agree.
- **Links:** Fault codes and recalls in answers become links only if they appear on the page.

## D18. Edge rate limits {#rate-limits}

- **Choice:** Two Vercel Firewall rules, counted per IP over 60 seconds, returning 429: 20 a
  minute for the AI routes and 30 a minute for note saves.
- **Options:** `checkRateLimit()` in the route; a Redis-based limiter; only the Cloud Run limit.
- **Why the edge:** A blocked request never starts a function or calls a model.
- **Limits:** Advisors at a contact center share office IPs, so per-IP limits don't suit
  production. Once Entra ID sign-in exists, limits should count per advisor, using
  `checkRateLimit()` with a `rateLimitKey`. Spend across many IPs is bounded by D23.

## D19. Evals {#evals}

- **Choice:** Vitest, run on demand with `pnpm eval`. The evals run the real agent and call
  summary against staging, through the real boundary, on each model alone, three times per case.
  Grading is deterministic: required facts must be present, and internal IDs, invented fault
  codes, assumed pronouns, promises and markdown must be absent. There are 10 agent cases and 7
  call-summary cases, including a request for another customer's VIN and a prompt injection.
- **Options:** HTTP requests against the route; recorded fixtures; an LLM judge.
- **What they caught:** Claude guessing pronouns, Gemini skipping driver safety and offering a
  loaner, Claude copying an injected instruction into a note, and a tool loop that added nothing
  (D30).
- **Results (Nov 2026):** The agent scored 30/30 and call summaries 21/21 on both models. The next
  step is running them on release PRs.

## D20. API rate-limit keying {#api-rate-limit-keying}

- **Finding:** The API's limit counted per IP, but all traffic arrives from Vercel's shared IPs,
  so every advisor shared one budget of 120 requests a minute.
- **Choice:** Count per calling service account, read from the IAM-verified token, at 1,200 a
  minute per environment. The edge limits people (D18), and the API limits calling systems.
- **Limit:** Counters live in each instance's memory, so the real ceiling can be up to three times
  higher. That's acceptable for a backstop.

## D21. Lookup {#lookup-and-layout}

- **Suggestions:** Suggestions come only from the browser (recent vehicles and live VIN and email
  checks). Searching the server by prefix would let anyone list customers on a public prototype,
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
  so a retry repeats the whole save.

## D23. Spend alerts {#spend-alerts}

- **Choice:** A $25/month budget alert on Vertex AI and Gemini spend (`infra/budget.tf`), and a
  $25/month hard limit on Anthropic.
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
- **Rollout:** The VIN is a new required field, so the API ships first.

## D26. Non-support transcripts {#junk-transcripts}

- **Finding:** Given a transcript with nothing to summarize, the model presented the vehicle
  record as if it were the call.
- **Choice:** Prompt rules plus a `callType` field (`vehicle_issue`, `other` or
  `no_conversation`). Any type other than `vehicle_issue` shows a warning in the review form. The
  field isn't saved, but it gives the evals something exact to check.
- **Length limits:** The draft schema states length limits but doesn't enforce them, so an
  over-long draft doesn't vanish in the browser. Instead, the save action names the field that's
  too long.

## D27. Agent request checks {#agent-request}

- **Finding:** The route accepted any role, any message part type and empty questions.
- **Choice:** An allow-list in `lib/ai/agent-request.ts`: `user` and `assistant` roles, text-only
  user messages, up to 2,000 characters per question and 80,000 across the last 10 messages.
  Rejected requests get a 400 or 413 before any model call.
- **Limit:** A caller can forge earlier assistant turns, but only within their own session.

## D28. Current state {#current-state}

- **Choice:** Meridian's console today is a React app built with Vite, served from Cloud Storage
  behind Cloud CDN, with Microsoft Entra ID sign-in. The browser calls REST services on Cloud Run
  in `us-central1`. Cloud Build uploads each release to the bucket, and there is one shared
  staging environment. About 80 advisors work in North America, Europe and the Middle East.
- **Options:** Next.js already self-hosted on GKE; the same app on VMs.
- **Why:** This is how a typical mid-market company runs an internal React app, and its problems
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

## D30. Record up front {#agent-context}

- **Finding:** Both models called all three tools for every question, so the first round trip
  decided nothing.
- **Choice:** The route loads the vehicle, its cases and the 20 newest telematics events from the
  page's cached fetchers, and sends them as a second system message after a static prompt that
  providers can cache.
  - **Shaped for the model:** No internal IDs, dates already formatted, and repeat counts
    computed in code.
  - **One tool:** `getTelematics`, for older history, with a step cap of 3.
  - **History:** Earlier tool results sent by the browser are dropped, since they could be forged.
  - **AI Gateway:** `caching: 'auto'`, and a `feature:` tag per route for spend reporting.
- **Options:** Forcing the first step to call the tools, which Claude rejects with thinking on;
  keeping the loop.
- **Results:** Gemini scored 30/30 with a 2.6 s median (down from 4.7 s). Claude scored 30/30 (up
  from 29/30) at 4.0 s (down from 5.4 s), using about 20% fewer tokens.

## D31. Case view {#case-view}

- **Choice:** A case page at `/vehicles/[vin]/cases/[caseId]`, showing status, an overdue banner,
  a quick note, Close with a required resolution, the activity thread and related faults. The
  customer's schema doesn't change. The assistant lives in the vehicle layout, so the chat and any
  draft survive moving between pages.
  - **Close:** `POST /cases/:id/close`, with the same ownership check as D25. It returns 409 if
    the case is already closed.
  - **Overdue:** A case is overdue when it's open with no note for 5 business days. That's a desk
    policy rather than customer data, so the web app computes it.
  - **Related faults:** Coded faults from the 7 days before the case opened, labelled as a match
    by date.
- **Cut:** Escalation, case numbers, owner, priority and dealer repairs. Each needs advisor
  identity, a migration or another customer system.

## D32. Release versions {#release-versions}

- **Choice:** Date-based versions, such as branch `release/26.11.15.1` and tag `v26.11.15.1`. A
  date tells support which build is live, and this is an app, not a library. `package.json`
  versions stay semver.
- **First release:** Production was reseeded once by hand through the Auth Proxy, with a temporary
  password rotated afterwards. CI never reseeds production.

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

- **Today:** Fluid compute in `cle1`. Cloud Run runs up to 3 instances of 80 requests each per
  environment. One `db-f1-micro` database, with about 25 connections, serves both environments.
- **Finding:** At 5 connections per instance, full scale would need 30.
- **Choice:** A pool of 4 per instance, 24 in total, noted next to both settings.
- **Fit:** 80 advisors generate a few requests a second at peak, well within these limits. The
  database's connection limit is the real ceiling; beyond it, use a larger instance or a
  connection pooler.

## D35. Rollout {#rollout}

- **Today:** Every branch gets a Preview Deployment against staging (D12). Merging a `release/*`
  branch to `master` deploys the production API and web app (D32). Rollback is Instant Rollback on
  Vercel and the previous revision on Cloud Run. Migrations are expand-then-contract, and the API
  ships first when a change spans both sides.
- **For Meridian:** A pilot group validates each rebuilt screen, and everyone switches once all
  screens are validated. The React app stays read-only for 30 days. After the switchover,
  releases use Rolling Releases and Skew Protection.

## D36. Warm API {#warm-api}

- **Measured:** With staging at zero instances, the first vehicle page took 6.8 s. About 3.8 s
  was Cloud Run starting up; the rest was a cold function, the token exchange and an empty cache.
  Production, with one instance running, took 0.46 s.
- **Choice:** One minimum instance on production; staging still scales to zero. It costs about
  $10/month while idle (an estimate) and stays within D34's connection limit.
- **Options:** A scheduled `/health` ping.
- **Doesn't fix:** The Vercel side after a deploy: an empty Runtime Cache, and one token exchange
  per new instance.

## D37. Past telematics {#telematics-windows}

- **Finding:** Related faults were filtered from the newest 50 events, so an older case's week
  came back empty.
- **Choice:** The API accepts `from`, `to` and `codedOnly` on telematics, and the case page reads
  one window per case. A window that ended more than 24 hours ago is cached for days; a newer one
  is read fresh. The 24 hours allows for vehicles that upload late after being offline.
- **Options:** Caching the live feed briefly; fetching only new events.
- **Production path:** The ingest pipeline would invalidate `telematics:{vin}` when a late event
  arrives.

## D38. Seeded case activity {#seed-activity}

- **Choice:** Note threads only where a story needs one, on the current schema. Dana's three
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

- **Choice:** The Ask tab suggests up to five questions written for the open vehicle, from fixed
  rules: the fault the status row shows (recurring or first time), open cases, the first open
  recall, what to tell the customer, a status summary, and what changed since the last contact
  when there's no fault. The vehicle layout starts loading them without waiting and passes the
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
    cite them; internal IDs stay hidden (narrows D15 and D30).
  - **New writes**, in the existing pattern (`POST /cases/:id/...` with the VIN in the body, a 404
    for another vehicle's case or note, as in D25): `reopen` with a reason, which clears the
    resolution and keeps the reason and the old resolution as a rep note; and a note's `remove`
    and `restore`. A note on another case, a second close, reopen or removal all get a 409.
  - **Removing a note** sets `removedAt`. Case reads leave removed notes out, so the assistant
    never reads them, and restore (Undo) brings a note back unchanged.
  - **Rep notes** need only a summary; `issue` is nullable. AI-drafted notes still need all three
    fields.
  - **Vehicle read:** Adds the owner's phone for the contact buttons. The model never gets it.
- **Options:** A number generated in the web app from the cuid; moving every case route under
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
