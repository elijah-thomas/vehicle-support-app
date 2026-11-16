# Decisions

The architectural decisions behind this build: what was chosen, what else was considered, and
why. Numbers are stable; gaps are entries that were folded into another or cut as conventional.
Where a decision lands in code, a short `Decision (Dnn)` comment sits at that line.

## Index

**Scenario**
- [D1](#scenario) Scenario and Vercel's role · [D39](#current-state) The customer's current state ·
  [D6](#primitives) Vercel primitives

**Boundary and connectivity**
- [D2](#gcp-backend) GCP compute and database · [D3](#boundary-auth) Authenticating across the
  boundary · [D16](#api-shape) Shape of the customer's API · [D17](#contracts) How the web app
  knows the API's shapes · [D19](#db-access) Cloud Run → Cloud SQL · [D21](#function-region)
  Vercel function region · [D46](#concurrency) Concurrency and scaling ·
  [D48](#warm-api) Keeping the production API warm · [D49](#telematics-windows) Caching past
  telematics

**Delivery and rendering**
- [D24](#vehicle-page-caching) Vehicle page rendering and caching · [D28](#vehicle-status) Status
  row · [D40](#error-states) Error states · [D42](#case-view) Case view ·
  [D32](#lookup-and-layout) Lookup suggestions

**AI and agents**
- [D11](#models) Models, credentials, failover · [D25](#agent) Vehicle agent ·
  [D41](#agent-context) Load the record before the agent runs · [D26](#call-summary-generation)
  Call summary · [D37](#junk-transcripts) Transcripts that aren't support calls ·
  [D45](#cost-per-run) Cost per run · [D30](#evals) Evals

**Data integrity**
- [D14](#data-model) Data model and synthetic data · [D36](#note-ownership) Note ownership ·
  [D33](#save-feedback) Save failures

**Release path**
- [D18](#terraform) Infrastructure as code · [D22](#environments) Staging and production ·
  [D23](#pipeline) API deploy pipeline · [D47](#rollout) Rollout and rollback ·
  [D43](#release-versions) Release versions · [D35](#tests) Tests

**Protection and spend**
- [D29](#rate-limits) Edge rate limits · [D31](#api-rate-limit-keying) API rate-limit keying ·
  [D38](#agent-request) What the agent route accepts · [D34](#spend-alerts) Spend alerts

---

## D1. Scenario and Vercel's role {#scenario}

- **Decision:** Which customer scenario, and what role Vercel plays.
- **Options:** Replace, Augment, Connect.
- **Choice:** Connect (with Replace and Augment where D39 calls for them). A fictional
  automaker's support org keeps its customer, vehicle, telematics, and case data on GCP. Vercel
  hosts the rep-facing app and agent that read from it and write case notes back.
- **Why:** Based on a support/CRM tool I operated. Reps lose time flipping between screens to
  assemble a vehicle's status and history; the agent compiles it. The system of record stays put.

## D2. GCP compute and database {#gcp-backend}

- **Decision:** What runs the customer's existing backend and data in the demo.
- **Options:** Cloud Run + Cloud SQL Postgres; Cloud Run + Firestore; external Postgres (Neon).
- **Choice:** Express API on Cloud Run, backed by Cloud SQL Postgres, with Prisma owned by the API
  (schema, migrations, seed).
- **Why:** The most realistic picture of an enterprise system of record that stays in the
  customer's cloud. The API is the only path to the database; Vercel never connects to Postgres.

## D3. Authenticating across the boundary {#boundary-auth}

- **Decision:** How the Vercel app proves its identity to the GCP API.
- **Options:** a shared API key in an env var (simple, but a long-lived secret to leak and
  rotate); Vercel OIDC token exchanged through GCP Workload Identity Federation, with Cloud Run
  IAM enforcing access.
- **Choice:** Vercel OIDC → Workload Identity Federation → Cloud Run IAM. The federated
  credential calls `generateIdToken` for the caller service account directly (one permission,
  one hop); the ID token is cached per function instance for about an hour.
- **Why:** No long-lived secret anywhere, access scoped per Vercel project and environment (D22),
  and the Cloud Run service isn't callable from the internet without a Google-signed token.
  GitHub Actions deploys the same way (D23).
- **Verified (boundary spike):** works end to end from a Vercel deployment (anonymous calls get
  403), and the OIDC token is available inside a `"use cache"` function at request time, so the
  caching plan (D24) needed no fallback.
- **Production design, not built:** network isolation as well as identity: Cloud Run internal
  ingress behind a load balancer, reached through Vercel Secure Compute (static IPs, VPC
  peering; Enterprise plan).

## D6. Vercel primitives {#primitives}

- **Decision:** Which Vercel products the demo uses, beyond the Next.js app itself.
- **Options considered:** Workflows, Cache Components, Rolling Releases, Fluid Compute.
- **Choice:** AI SDK (agent and structured call summary), AI Gateway (BYOK routing, failover,
  spend by feature), Cache Components (static shell, shared cached data, tag invalidation,
  streamed fresh data), Fluid Compute (functions that mostly wait on models), plus Vercel
  Firewall and Preview Deployments. Workflows is phase 2, not built.
- **Why not Workflows now:** every AI request is short, read-only until the rep presses Save, and
  cheap to retry, so durable execution adds cost without benefit today. It earns its place
  once summaries become a background job with an async supervisor approval.
- **Why Fluid Compute:** an agent request spends most of its time waiting on the model; Fluid
  bills active CPU and lets one instance serve many waiting requests (D46).

## D11. Models, credentials, and failover {#models}

- **Decision:** Which models answer, whose credentials pay for them, and what happens when one
  fails.
- **Options considered:** Vercel's provider keys only (no BYOK); three layers (Gemini on Vertex →
  Claude on Vertex → Claude on Anthropic); two independent vendors with BYOK.
- **Choice:** Gemini 3.8 Flash on Vertex (BYOK, the customer's GCP commitment) → Claude Sonnet
  5.5 on Anthropic (BYOK) → Vercel's provider keys (AI Gateway's automatic retry when a BYOK key
  fails). `only: ["vertex", "anthropic"]` keeps each model on the provider it should bill to.
- **Why:** two vendors on two clouds, so a Vertex-wide failure (outage, quota, credentials,
  region) still has a path. Claude on Vertex was dropped from the first design: it shares Vertex
  with the primary, needs Model Garden enablement, and a Vertex BYOK credential holds one
  location.
- **Facts checked (vercel.com/docs/ai-gateway, Nov 2026):** Vertex BYOK takes a service-account
  key only (the one long-lived credential in the system, scoped to Vertex AI User and stored only
  in AI Gateway). BYOK requires purchased Gateway credits. AI Gateway budgets don't cap BYOK
  spend (hence D34).
- **Consequences:** answers can differ between models, so evals run on both (D30). The
  Vercel-key fallback means a request can leave my provider agreements; `only` doesn't disable
  it. Sending data to Anthropic leaves GCP, which matters if residency becomes a constraint.

## D14. Data model and synthetic data {#data-model}

- **Decision:** The shape of the customer's existing data, and what the test data tells.
- **Options:** a leaner model without recalls; a full model with recalls.
- **Choice:** eight tables: `customers`, `vehicle_models` (factory specs), `vehicles` (VIN as
  primary key), `telematics_events`, `recalls`, `vehicle_recalls`, `cases`, `case_notes`. Seeded
  with five synthetic stories for a fictional make, Meridian Motors: a recurring fault, a symptom
  matching an open recall, a healthy new vehicle, a customer with two vehicles, and a fault that
  returned after a closed case.
- **Why:** specs belong to the model, not the vehicle, which makes them the most cacheable data.
  VIN is the identifier reps already use. Recalls enable the highest-value connection the agent
  can make. Each story is also an eval case.

## D16. Shape of the customer's API {#api-shape}

- **Decision:** Whether the GCP API returns raw records or agent-ready summaries.
- **Options:** shaped around the data; shaped for the agent (pre-summarized endpoints).
- **Choice:** shaped around the data: customer by email, vehicle by VIN (with specs and recalls),
  telematics, cases (with notes), create case, add note, close case. One error shape:
  `{ error: { code, message } }`.
- **Why:** the customer's API already exists and shouldn't change to accommodate AI. All
  AI-specific logic stays on the Vercel side of the boundary.
- **Note:** Express has no auth code: Cloud Run IAM rejects unauthenticated callers before a
  request reaches the container (D3).

## D17. How the web app knows the API's shapes {#contracts}

- **Decision:** Share types between the API and the web app, or keep them separate.
- **Options:** a shared `packages/contracts`; the web app owns its own Zod schemas.
- **Choice:** the web app defines its own Zod schemas in `lib/customer/` and validates every
  response.
- **Why:** in reality another team owns the customer's API; the Vercel app treats it as an
  external contract and checks it at the boundary. Cost: shapes are written twice.

## D18. Infrastructure as code {#terraform}

- **Decision:** How the GCP side is defined and changed.
- **Options:** ad hoc gcloud commands; Terraform for GCP only; Terraform for GCP and Vercel.
- **Choice:** Terraform for GCP (`infra/`), state in a versioned GCS bucket. Three things stay
  out: the running image (GitHub Actions deploys it), Postgres GRANTs (`infra/sql/grants.sql`),
  and the Vercel project (its provider needs a long-lived Vercel API token). Firewall rules are
  JSON in `infra/vercel-firewall/`, applied with the Vercel CLI.
- **Why:** the boundary (WIF trust, IAM bindings) is what reviewers will question, so it should
  be readable code, and constraint changes become reviewed diffs.

## D19. Cloud Run → Cloud SQL access and region {#db-access}

- **Decision:** How the API connects and authenticates to Postgres, and where it runs.
- **Options:** connector + password; connector + IAM database login; private IP in a VPC.
- **Choice:** Cloud SQL connector with IAM database login, in `us-central1`. The database has a
  public IP with no authorized networks, so only the IAM-checked, mTLS connector can connect. The
  API's database user reads and writes rows but can't change the schema; migrations run as the
  environment's deployer (D23). Private IP is the production design.
- **Why:** extends "no long-lived secrets" to the database: no database password exists.

## D21. Vercel function region {#function-region}

- **Decision:** Where Vercel Functions run.
- **Options:** `iad1` (default, Washington D.C.); `cle1` (Cleveland); multiple regions.
- **Choice:** `cle1`, set in `apps/web/vercel.json`.
- **Why:** every dynamic request crosses to GCP `us-central1` (Iowa). `cle1` is the closest Vercel
  region to it, and functions belong next to their data. Users are internal reps; the static
  shell is still served from Vercel's global CDN.
- **Trade-off:** one region. If `cle1` fails, Vercel reroutes to the next closest region
  (per-function failover is Enterprise).

## D22. Staging and production environments {#environments}

- **Decision:** Whether the GCP side has one environment or two.
- **Options:** one environment for every Vercel deployment; staging + production.
- **Choice:** two. `develop` deploys `vehicle-support-api-staging` (database
  `vehicle_support_staging`); `master` deploys `vehicle-support-api` (`vehicle_support`), on one
  Cloud SQL instance. Vercel Preview and Development use staging; Vercel Production uses
  production.
- **Isolation is enforced:** separate runtime, caller, and deployer service accounts per
  environment. WIF maps `project:environment` from the Vercel token, so preview tokens can only
  become the staging caller. Each database revokes `CONNECT` from `PUBLIC`, so staging accounts
  can't even connect to production.
- **Why:** a preview deployment can never read or write production data, so the rollout plan
  (preview → staging → production) is real rather than described.

## D23. API deploy pipeline {#pipeline}

- **Decision:** How the GCP API is built, migrated, and released.
- **Choice:** GitHub Actions (`.github/workflows/deploy-api.yml`) on push to `develop` or
  `master`: build image → `prisma migrate deploy` through the Cloud SQL Auth Proxy → roll out the
  new revision. Auth through a second WIF provider for GitHub, trusted by immutable repository
  ID; each branch can only act as its environment's deployer. Staging can be reseeded on demand;
  production never is. The web app deploys separately through Vercel's Git integration, as it
  would at a customer where two teams own the two sides.
- **Options considered:** migrations as a Cloud Run Job (stays inside GCP, but needs a separate
  image with the Prisma CLI); Terraform plan/apply in CI (needs project-wide read for GitHub's
  identity).
- **Why this order:** a failed migration leaves the running revision untouched. Migrations must
  be backward compatible (expand, then contract) because the old revision serves until the new
  one is ready.

## D24. Vehicle page rendering and caching {#vehicle-page-caching}

- **Decision:** What is static, cached, or fresh on `/vehicles/[vin]`, and where cached data lives.
- **Options (store):** plain `"use cache"` (in memory per instance, free) or `"use cache: remote"`
  (Vercel Runtime Cache: shared by all instances in the region, isolated per environment).
- **Choice:** a static shell (layout, headings, skeletons) with independently streamed panels:

  | Data | Strategy | Tag |
  |---|---|---|
  | Vehicle, specs, recalls | `use cache: remote`, `hours` (`minutes` if not found) | `vehicle:{vin}` |
  | Cases and notes | `use cache: remote`, `minutes`; cleared by `updateTag` on save | `cases:{vin}` |
  | Telematics (live feed, agent) | Not cached; request time (`connection()`) | — |
  | Telematics windows (related faults) | `use cache: remote`, `days`, once settled (D49) | `telematics:{vin}` |
  | Customer search by email | Not cached; Server Action, so the email never appears in a URL | — |

  No vehicle pages are prerendered at build time.
- **What the shell holds:** panel titles and skeletons shaped like each panel, so the layout
  doesn't jump as data arrives. The assistant's fallback is its real empty state (sources,
  prompts, input, transcript box), disabled until the VIN resolves. Considered: reading the VIN
  with `useParams()` so the whole chat prerenders. Not tried, since a param read during prerender
  may need its own Suspense boundary anyway.
- **Why remote:** in-memory entries live per instance, so `updateTag` after a save could leave
  another instance serving old cases. The Runtime Cache is shared and environment-isolated. It
  starts empty after each deploy.
- **Why these lifetimes:** specs never change; recall status rarely does. Cases also change in the
  existing CRM, which never tells this app, so a short lifetime bounds staleness there.
- **Accepted staleness:** `hours` refreshes after an hour and keeps an entry up to a day. A recall
  completed, or owner details changed, in the CRM can show here for about an hour. Recalls are
  rare, so refreshing more often would cost GCP calls for almost no gain. Nothing clears
  `vehicle:{vin}` today; the tag is the hook for the production path.
- **Personal data:** owner names and emails are cached up to a day, case text up to an hour, in
  one region, isolated per environment. Flagged as a customer approval item.
- **Production path:** the CRM emits change events (customer updated, recall completed, case
  changed) to an authenticated Vercel route that calls `revalidateTag` for that VIN. Then
  lifetimes can grow, since staleness no longer depends on them. Not built: a demo has no CRM
  writing behind its back.

## D25. Vehicle agent {#agent}

*Data loading and the prompt were redesigned in D41; scope and limits still hold.*

- **Decision:** How the AI assistant is scoped and bounded.
- **Choice:** a `ToolLoopAgent` (AI SDK) behind `POST /api/agent`, in a chat panel on the vehicle
  page with canned prompts.
  - **Scope:** the tool takes no VIN. The route passes the vehicle the rep has open, so no prompt
    can make the agent read another customer's record.
  - **Limits:** step cap, `reasoning: "low"`, last 10 messages, request checks (D38). No
    output-token cap.
  - **Grounding:** only facts in the record or a tool result, cited with dates; says so when data
    is missing; never quotes internal IDs; ends with next steps.
- **Options considered:** letting the model choose the VIN (enables comparing a customer's
  vehicles, but a crafted prompt could pull any record); cheaper models (Haiku, Flash Lite).
- **Why no output cap:** Gemini's hidden reasoning counts toward `maxOutputTokens`; at 1,000 it
  cut answers off. A truncated answer is worse than a long one, and cost per message is already
  bounded by the step cap, input caps, and rate limits (D45).

## D26. Call summary {#call-summary-generation}

- **Decision:** How a pasted transcript becomes a saved case note.
- **Choice:**
  - **Fields** match `case_notes` exactly (issue, summary, next steps), plus a suggested subject
    and category used only for a new case. No database change.
  - **Generation:** one structured call (`streamText` + `Output.object`) with the record loaded
    up front, not an agent loop. The draft streams into the form.
  - **Human in the loop:** nothing is written until the rep edits and presses Save. The case
    picker defaults to the case the rep has open, else the most recent open case, with "New
    case" for a call about something new.
  - **Save:** a Server Action creates the case if needed, posts the note to GCP
    (`source: AI_DRAFT_EDITED`), then `updateTag('cases:{vin}')`, so the next render shows it.
  - **Limits:** transcripts up to 15,000 characters (about a 15-minute call).
  - **Safety:** the transcript is untrusted content, and the call has no tools, so instructions
    hidden in a transcript can't fetch or change anything.
- **Options considered:** display only (no write-back); reusing the agent with tools (flexible
  but multi-step, slower, harder to evaluate); always a new case (duplicates for repeat callers).
- **Risk to flag:** transcripts are personal data sent to the model providers. Production answer:
  AI Gateway Zero Data Retention routing and a retention review with the customer's privacy team.

## D28. Vehicle status row {#vehicle-status}

- **Decision:** How the vehicle page answers "what's wrong with this car?" at a glance.
- **"Recent" faults:** 30 days. Telematics has no active/cleared state, so a time window stands
  in for "still happening"; 7 days hides a fault that came back three weeks ago. The real fix is
  a cleared flag in the customer's telematics API.
- **Rendering:** each status item streams behind its own `<Suspense>`. Recalls arrive with the
  cached vehicle and show at once; cases and telematics stream in behind skeletons, so the cached
  header never waits on fresh data. The panel and the row share one telematics fetch and one
  clock reading per request (React `cache()`), so counts agree.
- **References in answers:** fault codes and recall campaigns in the agent's text become links
  by pattern match, only if the target exists on the page. No new data flows to the client.

## D29. Rate limits on the public endpoints {#rate-limits}

- **Decision:** Where and how tightly to rate-limit the unauthenticated AI and save endpoints.
- **Options considered:** Vercel Firewall custom rules at the edge; `@vercel/firewall`
  `checkRateLimit()` in the route (the function has already started); an in-app limiter on Redis
  (new service and cost); only the Cloud Run backstop (doesn't protect model spend, which happens
  on Vercel).
- **Choice:** two Vercel Firewall rules, fixed 60-second window, keyed by IP, returning 429:
  - `POST /api/agent` or `POST /api/call-summary`: 20 per minute.
  - Note saves (`POST /vehicles/*` with a `Next-Action` header): 30 per minute.
- **Why the edge:** a blocked request never starts a function or reaches a model, so it costs no
  compute and no tokens.
- **Verified:** 25 POSTs returned 20 × 400 then 5 × 429, on preview and production. Project
  rules apply to preview deployments too.
- **Limits to flag:** per-IP limits don't bound spend from many IPs (D34 is the backstop), and
  counters are per region. With rep login (out of scope) the limit would key on the rep.

## D30. Evals {#evals}

- **Decision:** How to check that the agent and call summaries stay grounded, on both models.
- **Choice:**
  - **Harness:** Vitest, run on demand with `pnpm eval`. Not in CI yet: real model calls cost
    money and aren't deterministic. CI evals on release PRs are the next step.
  - **What runs:** the real agent and the real call-summary request, with the model and loaders
    injected. Each model runs alone with failover off, so a score belongs to the model it names.
    Data comes from the staging API over the real OIDC → WIF path.
  - **Grading:** deterministic only: expected tools, required facts, forbidden text (internal IDs,
    invented fault codes, assumed pronouns, promised loaners or buybacks, markdown). No LLM judge:
    free, stable, and every failure is explainable.
  - **Cases:** 10 agent and 7 call-summary cases built on the seeded stories, including a request
    for another customer's VIN and a prompt injection inside a transcript. Each runs 3 times.
- **Options considered:** HTTP against the running route (can't pick the model without a public
  override); recorded fixtures (skip the boundary and drift with the seed); an LLM judge.
- **What the evals changed:** Claude guessed pronouns from names (fixed with a positive
  alternative and its reason, not a bare ban); Gemini skipped driver safety on a CRITICAL fault
  and offered a loaner (safety first; coverage and loaner requests are routed, not promised);
  Claude copied an injected instruction into a saved note, a stored prompt injection (the
  prompt now leaves such text out); the agent's tool loop added nothing (D41).
- **Latest results (3 runs per case, Nov 2026):** agent 30/30 on both models; call summaries 21/21
  on both.

## D31. Vehicle API rate-limit keying {#api-rate-limit-keying}

- **Decision:** What the vehicle API's backstop rate limit counts per client.
- **Finding:** it counted per IP, but every rep's traffic arrives from Vercel's shared outbound
  IPs, so the whole support team shared one 120/min budget. The evals hit it.
- **Options considered:** per calling system (the service account in the ID token); per rep
  (needs rep login); no API limit (nothing protects the backend from a retry loop); keep per IP.
- **Choice:** per calling system, 1,200/min, set per environment in Terraform. Each layer has one
  job: the Firewall limits each person at the edge (D29); the customer's API limits each calling
  system. A second internal system would get its own budget automatically.
- **Why reading the token is safe:** Cloud Run IAM verifies the ID token before the request
  reaches the container. Locally there is no token, so the limiter falls back to the IP.
- **Limit to flag:** counters live in each instance's memory, so with up to 3 instances the real
  ceiling is up to 3×. A shared store would make it exact; not worth it for a backstop.

## D32. Lookup suggestions {#lookup-and-layout}

- **Decision:** What the lookup suggests, and how telematics units are shown.
- **Lookup suggestions:**
  - **Options:** client-only (recents in this browser, demo stories, live VIN/email checks);
    server prefix search (`GET /customers/search?q=`).
  - **Choice:** client-only. Prefix search on an unauthenticated public demo would let anyone
    list customer emails and VINs; it belongs behind rep sign-in.
  - **Recents:** the last 5 vehicles opened, in `localStorage`, storing VIN, vehicle and owner
    name, never emails. In production this would be rep-scoped server storage.
- **Telematics units:** derived in the web app from the message's trailing "(miles)", "(%)",
  "(°C)" rather than adding `unit` to the customer's API. Brittle by design; the production fix is
  a `unit` field in the API.
- **Layout:** Call summary is a tab beside Ask in the assistant column, and both tabs stay
  mounted, so switching never loses the chat or an unsaved draft.

## D33. Save failures {#save-feedback}

- **Decision:** What happens when saving a call note fails.
- **Found:** a save that failed before the Server Action answered (a Firewall 429, a dropped
  connection) threw in the browser; the page's error boundary replaced the page and the rep's
  edits were lost.
- **Choice:** the rep's edits always stay in the form, and the error says what happened, by the
  vehicle API's status (404: case gone; 400: rejected, with the reason; 429: busy). On success the
  panel links to the new note and highlights it in place.
- **Saving to a new case:** `POST /cases` takes the first note and writes the case and note in
  one transaction, so a failure leaves nothing behind and the rep's retry is the whole save
  again. It used to be two calls: a failure between them left an empty case, and an earlier fix
  only steered the retry to it. The note is optional in the API, so other callers that open cases
  without one are unaffected. The API deploys before the web app, which now expects the note in
  the response.

## D34. Spend alerts on the model providers {#spend-alerts}

- **Decision:** What stops runaway model spend beyond per-IP rate limits.
- **Options considered (GCP):** a budget alert in Terraform; an alert plus a lower Vertex
  requests-per-minute quota (set outside Terraform, project-wide); a budget that unlinks billing
  through Pub/Sub (a true stop, but it would shut down every workload in this shared project).
- **Choice:** a $25/month budget alert on Vertex AI and Gemini API spend (`infra/budget.tf`),
  emailing at 50%, 90%, 100%, and 100% forecast; and a $25/month hard spend limit on Anthropic.
- **Detail that matters:** the budget measures spend before credits (`EXCLUDE_ALL_CREDITS`);
  usage here is paid from credits, so a budget after credits would read $0 and never alert.
- **Limits to flag:** GCP budgets alert, they don't stop, and billing data lags by hours. In
  production: Vertex quotas per model and alerts to on-call rather than email.

## D35. Tests {#tests}

- **Decision:** Which behaviors to test, and where.
- **Choice:** API tests against a real Postgres through the real Express app (contract shapes,
  privacy, bad input, ownership rules, rate limit); about 100 web unit tests in Node (parsing,
  formatting, request checks before any model call, the save action's errors and retry). Model
  behavior stays in evals (D30). CI (`.github/workflows/test.yml`) runs both on every PR, with
  Postgres as a service container and no secrets.
- **Options considered:** mocking Prisma (the behavior lives in the queries, so it would test the
  mocks); component tests (new dependencies); Playwright (slow for this scope; in the rollout plan).
- **Safety:** the API tests refuse any database whose name doesn't end in `_test`, because the
  seed deletes every row. That came from a near miss where setup pointed at the dev database.

## D36. Notes can only land on the vehicle's own cases {#note-ownership}

- **Decision:** Where to enforce that a saved note belongs to the vehicle the rep has open.
- **Finding:** the save action posted whatever case ID the browser sent, and the API didn't check
  it. A Server Action is a public POST endpoint, so a crafted request could attach a note to
  another customer's case.
- **Options considered:** check in the API (the note carries the VIN; the API refuses a case that
  isn't that vehicle's); check in the web action (one extra read, and only this client is
  protected).
- **Choice:** the API. The system of record enforces its own integrity, so every client gets it.
- **Rollout note:** a new required field, so the API ships before the web app. In a real
  integration I'd accept it as optional first, then require it once every client sends it.

## D37. Transcripts that aren't vehicle support calls {#junk-transcripts}

- **Decision:** What the call summary does with a transcript that isn't a real support call.
- **Finding:** with nothing to summarize, the model presented the vehicle record as the call (a
  transcript of "." produced a battery fault issue).
- **Options considered:** prompt rules alone; prompt rules plus a `callType` field the UI can act
  on; refusing short transcripts on the server (brittle: real short calls exist).
- **Choice:** prompt rules plus `callType` (`vehicle_issue`, `other`, `no_conversation`). Anything
  but `vehicle_issue` shows a warning in the review form. The field isn't saved, and it gives the
  evals something exact to check.
- **Length limits in the draft schema** are stated, not enforced: the browser validates the
  streamed draft against the same schema, so a draft one character over would silently vanish.
  The save action names the field that's too long instead.

## D38. What the agent route accepts {#agent-request}

- **Decision:** How strictly the public agent route checks the conversation the browser sends.
- **Finding:** it accepted any role, any part type (a 27KB file part got past the per-message
  cap), and empty questions.
- **Options considered:** an allow-list of what the chat UI sends; rebuilding the history as
  plain text.
- **Choice:** the allow-list (`lib/ai/agent-request.ts`): `user` and `assistant` roles, text-only
  user messages, 2,000 characters per question, 80,000 across the last 10 messages, measured
  after trimming. Rejections return 400 or 413 before any model call.
- **Limit to flag:** a caller can forge earlier assistant turns, but only in their own session;
  the server drops earlier tool results (D41) and the tool reads only the vehicle the route names.

## D39. The customer's current state {#current-state}

- **Decision:** What Meridian's console runs on today, which the proposal compares against.
- **Options:** a client-rendered SPA served from one region; Next.js self-hosted on GKE behind
  Cloud CDN with an assistant already on Vertex AI; the same app on VMs; a shared Next.js cache on
  Redis.
- **Choice:** Next.js on GKE in `us-central1` behind Cloud CDN, with Next.js's default cache on
  each pod's disk. An assistant route calls Gemini through the Vertex AI SDK with hand-written
  tool calls. Releases go through Cloud Build and Argo CD to one shared staging namespace. The
  APIs and Postgres sit in the private network.
- **Why:** an enterprise that invested in this console would already have a CDN and a modern
  framework, and a reviewer would see through a weaker starting point. The case then rests on
  what a CDN can't fix (personal pages render at origin), what self-hosting Next.js costs (a cache
  per pod, upgrades, version skew during rolling deploys), no per-change previews, and a
  single-provider assistant. Replace the self-hosted platform, augment the Vertex agent with AI
  Gateway, connect to the systems that stay.
- **Why no Redis today:** with a cache per pod, a saved note clears only the pod that handled the
  save, and every rolling deploy starts cold, so cases go uncached. A shared Runtime Cache with
  `updateTag` on save (D24) is what makes caching cases safe.
- **Honest limits:** functions still run in one region next to the data (D21), so the gain for
  advisors abroad is the edge-served shell and streaming panels, not faster data.

## D40. Error states in the UI {#error-states}

- **Decision:** How the UI handles each failure the testing turned up.
- **Findings:** one failing panel replaced the whole vehicle page (an error inside `<Suspense>`
  bubbles to `error.tsx`); the lookup page had no error boundary; an invalid call-summary draft
  vanished silently; the chat had no retry.
- **Choice:**
  - **Panels fail alone:** `lib/load-panel.ts` catches a panel's fetch failure and the panel
    offers Retry. `unstable_rethrow` lets Next's control-flow errors through: `connection()`
    postpones prerendering by throwing, and swallowing it would break the static shell.
  - **Lookup:** the search action returns an inline error; `app/error.tsx` is the last resort.
  - **One error vocabulary for both AI routes** (`{ error: { code } }`), with Firewall 429s
    recognized by status.
  - **Chat:** a failed answer offers Try again.
- **Options considered:** a client error boundary per panel (needs a class component or a
  dependency; server-side failures are the ones that happen here).

## D41. Load the record before the agent runs {#agent-context}

- **Decision:** Whether the agent fetches the vehicle's data itself (a tool loop) or gets it up
  front, and how its prompt is built.
- **Finding:** in every eval run, both models called all three tools for every question. That
  first round-trip decided nothing.
- **Options considered:** load up front and keep one tool for depth; force the first step to call
  the tools (Claude rejects forced tool choice with thinking on, so failover would break); keep
  the loop.
- **Choice:** load up front.
  - **The record:** vehicle, cases, and the 20 newest telematics events, from the page's cached
    fetchers, as a second system message after a static prompt providers can cache. A source that
    fails is marked `unavailable` and the model says so.
  - **Shaped for the model** (`lib/ai/model-context.ts`): no internal IDs, dates pre-formatted,
    repeat counts per fault code computed in code.
  - **One tool:** `getTelematics` for older history. Step cap 3.
  - **History:** earlier turns' tool results are dropped on the server (they came from the
    browser and could be forged); text and reasoning stay.
  - **AI Gateway:** `caching: 'auto'` and a `feature:` tag per route, for spend and latency by
    feature.
- **Results (10 cases × 3 runs):** Gemini 30/30 at 2.6 s median (was 4.7 s); Claude 30/30 (was
  29/30) at 4.0 s (was 5.4 s) with ~20% fewer tokens. One model step per answer instead of two.
- **Trade-off:** the assistant does less visible "agent" work. The evals showed the loop added
  nothing, so the decision moved into code, and the tool stays for the one choice the model
  really makes.

## D42. Case view {#case-view}

- **Decision:** How a rep reads and works one case, after a UX audit found that "1 open case" led
  nowhere, an open case showed only its first line, a neglected case looked like a current one,
  and the only way to write a note was an AI draft.
- **Options considered:** the audit's full proposal (case numbers, escalation, owner, priority,
  waiting states, note authors, a fault history route, dealer repairs) or a trimmed version for
  one rep.
- **Choice:** the trimmed version, with **no change to the customer's schema**:
  - **Routes:** `/vehicles/[vin]/cases/[caseId]`. The assistant moved into
    `vehicles/[vin]/layout.tsx`, so the chat and an unsaved draft survive moving between the
    vehicle and its cases.
  - **Case view:** status, an overdue banner, a quick rep note, Close case with a required
    resolution, the activity thread, and related faults.
  - **API:** `POST /cases/:id/close` (same ownership check as D36; 409 if already closed, checked
    in the update itself so two closes can't both win).
  - **Overdue:** an open case with more than 5 business days since its newest note. Worked out in
    the web app: it's this desk's policy, not the customer's data.
  - **Related faults:** coded faults in the 7 days before the case opened. Cases have no link to
    telematics, so the page says it's a match by date.
  - **Caching:** the case view reads from the cached case list (`cases:{vin}`, D24); saving or
    closing clears that tag. Both routes still build as Partial Prerender.
- **Cut, and why:** escalation repeats what notes already say and the agent reads; case numbers
  need a migration and a change to the no-IDs rule; owner, priority, and waiting states need rep
  identity; dealer repairs live in another customer system.
- **Production path:** a per-case read and per-case cache tag once customers have hundreds of
  cases; a holiday calendar for overdue; a real case-to-fault link.

## D43. Release versions {#release-versions}

- **Decision:** How releases are numbered.
- **Options considered:** semantic versions, which signal compatibility to people who depend on a
  package; date-based `YY.MM.DD.N`, which say when a build shipped.
- **Choice:** date-based: `release/26.11.15.1`, tag `v26.11.15.1`; `N` counts releases that day.
  This is a deployed app, not a library, so a date tells support which build is live.
  `package.json` versions stay semver (npm requires it; both packages are private).
- **First release, 26.11.15.1:** the first pipeline run on `master` deployed the API and Vercel
  promoted the web app. Production still held the spike's seed, so it was reseeded once by hand,
  never from CI: a temporary `postgres` password, the seed through the Cloud SQL Auth Proxy, then
  the password rotated to a random value that isn't stored. Verified after release through the
  production WIF path: vehicle page, agent, call summary, Firewall 429s, API 400 on bad JSON.

## D45. Cost per run {#cost-per-run}

- **Decision:** How cost per answer is measured, and what bounds it.
- **Options considered:** compute it from token counts and a price table kept in the repo (goes
  stale as prices change); read the AI Gateway dashboard or spend report by tag (totals only, no
  per-answer figure); read the cost AI Gateway returns on every response.
- **Choice:** the per-response cost. Each step's `providerMetadata.gateway` carries `marketCost`
  (the tokens at list price), `gatewayCost` (the Gateway's own fees) and the routing record
  (provider served, every failover attempt). `lib/ai/usage.ts` sums them per answer. Both AI
  routes log one `ai_usage` line per answer to Vercel's runtime logs, and the eval report shows
  average cost per answer per model.
- **Why `marketCost`:** with our own keys, the Gateway's `cost` is 0; the provider bills the
  tokens. `marketCost` is what those tokens cost at list price, so it's the number to report. The
  real bill is the provider's invoice, after any discounts or credits.
- **Measured (evals, Nov 2026, average per answer at list price, two full runs):**

  | | Gemini 3.8 Flash | Claude Sonnet 5.5 |
  |---|---|---|
  | Agent answer | $0.0019–0.0020 | $0.0042–0.0059 |
  | Call summary | $0.0019 | $0.0039–0.0058 |

  About $2 per 1,000 answers on Gemini. Claude varies more with prompt-cache hits. The fallback
  costs 2–3× as much per answer as well as being slower, one more reason Gemini is primary.
- **Found while measuring:** reporting tags have a Gateway fee of $0.000075 per request
  (`gatewayCost`), about 4% on a Gemini answer. Kept: it's what splits spend by feature.
- **Bounded by:** one model step per typical answer and a cap of 3 (D41); input caps (D38, D26);
  20 AI requests a minute per IP at the edge (D29); provider spend limits (D34).

## D46. Concurrency and scaling {#concurrency}

- **Decision:** How each layer scales under load, and where it stops.
- **What exists now:**
  - **Vercel:** Fluid Compute, so one function instance serves many requests that are waiting on
    a model or on GCP, billed for active CPU. Functions in `cle1` only (D21).
  - **Cloud Run:** up to 3 instances per environment, 80 concurrent requests each (default).
    Production keeps one warm; staging scales to zero (D48).
  - **Cloud SQL:** one `db-f1-micro` instance for both environments, with a limit of about 25
    connections.
- **Finding:** each API instance opened up to 5 connections, so both environments at full scale
  (2 × 3 × 5 = 30) would hit connection errors before Cloud Run's own limits.
- **Options considered:** a pool of 4 per instance (free, one line); cap staging at one instance
  (no load testing on staging); a larger instance (`db-g1-small`, about $25/month more, and it hides
  the math).
- **Choice:** a pool of 4: 2 × 3 × 4 = 24. Each instance's 80 concurrent requests share 4
  connections, which is fine for millisecond queries. The limit is written next to both
  settings, so raising max instances means revisiting it.
- **Production path:** the database's connection limit is the real ceiling, not Fluid Compute or
  Cloud Run. Beyond it: a larger instance or a connection pooler (PgBouncer, or Cloud SQL Managed
  Connection Pooling).

## D47. Rollout and rollback {#rollout}

- **Decision:** How a change reaches production and how it's undone.
- **What exists now:** every branch gets a Preview Deployment against staging (D22); `develop`
  deploys the staging API; a `release/*` branch merged to `master` deploys the production API
  and promotes the web app (D43). Web rollback is Vercel Instant Rollback (the previous
  deployment is still live). API rollback is shifting traffic to the previous Cloud Run
  revision; migrations are expand-then-contract (D23), so the old revision still works against
  the new schema. When a change spans both, the API ships first (D36).
- **Out of scope:** Rolling Releases (canary a percentage of production traffic); in the rollout
  plan as the production step.
- **Status:** documented; details in the submission's rollout plan.

## D48. Keeping the production API warm {#warm-api}

- **Decision:** Whether the vehicle API scales to zero. After an idle spell, the first request
  waits for Cloud Run to start a container and for the Cloud SQL connector's setup.
- **Measured against staging:** a first load after idle took ~5 s; warm loads take 0.08–0.3 s.
  Keeping an instance running aims to bring that first load close to a warm one. Not yet
  measured.
- **Options considered:** a Cloud Scheduler job pinging `/health` every ~10 minutes (nearly free,
  but Cloud Run may still stop an idle instance, it warms only one, and it needs its own invoker
  service account); `min_instance_count = 1` on production; neither, only trimming startup.
- **Choice:** one minimum instance on production; staging still scales to zero. It's Cloud Run's
  supported setting, needs no new service or IAM, and stays inside D46's connection math (max is
  still 3 instances × 4 connections).
- **Cost:** an idle instance is billed at Cloud Run's reduced idle rate, roughly $10/month for
  1 vCPU and 512 MiB (estimate; confirm in the pricing calculator).
- **Doesn't fix:** the Vercel side. The Runtime Cache starts empty after each deploy, and each new
  Fluid instance does one token exchange.
- **To measure:** staging still scales to zero, so it is the comparison. After the next release,
  time a first load after an idle hour on each, and record both here.

## D49. Caching past telematics {#telematics-windows}

- **Decision:** Whether any telematics can be cached, after D24 kept it all fresh.
- **Finding:** related faults read the 50 newest events and filtered them to the week before each
  case opened. On a real vehicle with thousands of events, an older case's week falls outside the
  newest 50 and its related faults come back empty.
- **Options considered:** cache the live feed for 1–5 minutes (can hide the fault a customer is
  calling about, and a call costs a round trip whatever its size); fetch only events newer than
  the last ones seen and append them (saves bytes, not calls, and misses late uploads); fetch each
  case's week by date and cache it once it can no longer change.
- **Choice:** the last. The API takes `from`/`to` on `GET /vehicles/:vin/telematics`, a plain date
  filter on the existing `(vin, recordedAt)` index. The case page reads one window per case
  (`getTelematicsWindow`). A window that ended over 24 hours ago is cached with `days`; a newer one
  reads fresh. The live feed and the agent are unchanged.
- **Why 24 hours:** vehicles buffer events when offline and upload them late, and events carry
  only the vehicle's own `recordedAt`, so a window is only safe to cache once it has settled.
- **Trade-off:** a case page reads one window per earlier case (in parallel, cached when settled);
  a window is capped at 200 events.
- **Production path:** the ingest pipeline clears `telematics:{vin}` when a late event lands.
  Repeat counts on the live panel still come from the newest 20 events and undercount on a long
  history; the API returning per-code counts would fix that. Live updates during a call need the
  API to hand back a bookmark of what's been seen (phase 2).
