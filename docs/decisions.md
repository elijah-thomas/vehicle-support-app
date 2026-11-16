# Decisions

Settled decisions for this project. Each entry: the decision, options considered, the choice, and
why. To change one, add a new entry that supersedes it rather than editing history.

## D1. Scenario and Vercel's role {#scenario}

- **Decision:** Which customer scenario, and what role Vercel plays.
- **Options:** Replace, Augment, Connect.
- **Choice:** Connect. A fictional automaker's support org keeps its customer, vehicle,
  telematics, and case data on GCP. Vercel hosts a new agent experience that reads from it.
- **Why:** Based on a support/CRM tool I operated. Reps lose time flipping between screens to
  assemble vehicle status and history; the agent compiles it. The system of record stays put.

## D2. GCP compute and database {#gcp-backend}

- **Decision:** What runs the customer's existing backend and data in the demo.
- **Options:** Cloud Run + Cloud SQL Postgres; Cloud Run + Firestore; external Postgres (Neon).
- **Choice:** Express API on Cloud Run, backed by Cloud SQL Postgres.
- **Why:** Most realistic picture of an enterprise system of record that stays in the customer's
  cloud. The API is the only path to the database; Vercel never connects to Postgres directly.

## D3. Authenticating across the boundary {#boundary-auth}

> **Revisited and confirmed:** a rotated API key was considered for simplicity and rejected. The
> demo should show the enterprise pattern, not a shortcut. Network isolation (Cloud Run internal
> ingress behind a load balancer, allowlisting Vercel Secure Compute static IPs) is the
> production design, documented but not built, since Secure Compute requires an Enterprise plan.
> WIF is also used by GitHub Actions to deploy to Cloud Run, so no long-lived GCP keys exist in
> CI/CD or at runtime. Timebox: if the runtime WIF spike isn't working in ~2 hours, fall back to
> a rotated API key and record that as a new decision.

- **Decision:** How the Vercel app proves its identity to the GCP API.
- **Options:** Shared API key in an env var; Vercel OIDC token exchanged via GCP Workload
  Identity Federation for a service-account identity, with Cloud Run IAM enforcing access.
- **Choice:** Vercel OIDC → Workload Identity Federation → Cloud Run IAM.
- **Why:** No long-lived secrets to leak or rotate, access scoped per Vercel project and
  environment, and the Cloud Run service is not callable by the public internet.

## D4. Repo layout and deploys {#repo-layout}

- **Decision:** Where the GCP service lives and how each side deploys.
- **Options:** Separate repos; one monorepo with independent deploys.
- **Choice:** pnpm monorepo. `apps/web` auto-deploys to Vercel via Git integration;
  `services/vehicle-api` deploys to Cloud Run via GitHub Actions (also authenticating with WIF).
- **Why:** One public repo and one commit history for reviewers, while each side keeps its own
  release path, as it would at the customer.

## D5. Call-transcript summary feature {#call-summary}

- **Decision:** What the agent produces beyond lookups.
- **Choice:** Rep pastes a call transcript; the AI returns a concise call summary plus next steps
  for resolving the customer's issue, grounded in the customer's vehicle and case data.
- **Why:** This is work the UI can't do. It replaces manual note-writing after every call.
- **Update:** saved back to GCP; see D7.

## D6. Vercel primitives {#primitives}

- **Decision:** Which Vercel products the demo uses, beyond the Next.js app itself.
- **Options considered:** Workflows, Cache Components, Rolling Releases, Fluid Compute.
- **Choice:** AI SDK (agent + tools), AI Gateway (model routing, fallback, spend visibility),
  Cache Components (static shell, cached specs, streamed telemetry, tag invalidation), and Fluid
  Compute (agent runtime). Workflows is named as phase 2, not built.
- **Why:** Lookups are short, read-only, and cheap to retry, so durable execution adds cost
  without benefit today. Workflows earns its place once summaries move to a background job with
  an async supervisor approval. Fluid Compute fits an agent that spends most of its time waiting
  on the model, since it bills active CPU rather than wall-clock time.

## D7. Saving call summaries {#summary-writeback}

- **Decision:** Whether AI-drafted call summaries are persisted.
- **Options:** Display only; save to GCP after rep review.
- **Choice:** The AI drafts a structured summary (issue, summary, next steps). The rep reviews and
  edits it, then saves; the app writes it to Postgres via the GCP API as a case note and
  invalidates that customer's cached cases.
- **Why:** A human approves before anything is written to the system of record, and the write
  crosses the boundary and demonstrates targeted cache invalidation.

## D8. Protecting the public AI endpoint {#rate-limiting}

- **Decision:** How to stop abuse and runaway spend on a public, unauthenticated demo.
- **Choice:** Vercel Firewall rate-limit rule on the AI route, plus in-app caps on transcript
  size, agent steps, and output tokens.
- **Why:** The money is spent on the Vercel side (AI Gateway calls), so the limit belongs in front
  of the AI route, not only on the backend.
- **Resolved:** see D29. The output-token cap was dropped (D25).

## D9. Model provider credentials {#gateway-byok}

- **Decision:** Whose credentials AI Gateway uses for model calls.
- **Choice:** Bring-your-own-key: a Vertex AI service account configured in AI Gateway as the
  primary provider. Fallback via a second provider using either AI Gateway credits or my
  Anthropic organization's credits. Routing strategy: see D10.
- **Facts checked (vercel.com/docs/ai-gateway, Nov 2026):** Vertex BYOK takes a project,
  location, and service-account `clientEmail` + `privateKey`; there is no API-key or keyless
  option. BYOK requires purchased AI Gateway credits (free tier can't use it). BYOK is always
  tried first; on failure the Gateway retries with Vercel's own provider keys, billed to credits.
  AI Gateway budgets don't cap BYOK spend.
- **Resolved:** see D11.

## D10. Model failover chain (superseded by D11) {#failover}

- **Decision:** What happens when the primary model or provider fails.
- **Options:** Same model across providers (Claude: Vertex → Anthropic); model failover (Gemini
  on Vertex → Claude on Anthropic); three layers.
- **Choice:** Three layers: Gemini on Vertex → Claude on Vertex → Claude on Anthropic.
- **Why:** Layers 1→2 cover a model-specific failure while staying on the GCP commitment.
  Layer 3 covers a Vertex-wide failure (outage, quota, credentials, region), since layers 1 and 2
  share Vertex. Claude on Vertex is served on Google's infrastructure, independent of Anthropic's
  API; I've seen Anthropic's API degraded while Vertex stayed up, and the reverse is the reason
  for layer 3.
- **Consequences:** Answers may differ between Gemini and Claude, so evals must pass on both.
  Each hop adds latency. Layer 3 sends data outside GCP, which matters if data residency
  becomes a constraint.
- **Why:** Mirrors an enterprise that wants to keep model spend on its existing GCP commitment
  while gaining routing, failover, and observability from the Gateway.

## D11. Simplified failover and demo billing (supersedes D10) {#failover-v2}

- **Decision:** Simplify the failover chain and settle how the demo is billed.
- **Options:** Free tier only (no BYOK); three-layer chain from D10; two-layer chain with BYOK.
- **Choice:** Gemini on Vertex (BYOK, billed to GCP credits) → Claude on Anthropic (BYOK, billed
  to Anthropic org credits) → Vercel's provider keys (automatic Gateway fallback). Buy the
  minimum AI Gateway credits, since BYOK requires a purchased balance.
- **Why:** Two independent vendors on two independent clouds, each billed under an existing
  commercial agreement. Claude on Vertex was dropped: it shares Vertex with layer 1, needs Model
  Garden enablement, and a Vertex BYOK credential holds a single location, so mixing model
  regions would need request-scoped credentials. It can be re-added in config if needed.
- **Consequences:** Evals must pass on both Gemini and Claude. The Vercel-key fallback means a
  request can leave my own provider agreements; `only` does not disable it. Gateway budgets
  don't cap BYOK spend, so set a GCP budget alert and an Anthropic spend limit.

## D12. Database access from the API {#orm}

- **Decision:** How `services/vehicle-api` talks to Cloud SQL Postgres.
- **Options:** Prisma; Drizzle; raw SQL with `pg`.
- **Choice:** Prisma, owned by `services/vehicle-api` (schema, migrations, seed live there).
- **Why:** Familiar to me, a readable schema file reviewers can scan to understand the data
  model, typed queries, and built-in migrations and seeding.
- **Note:** Only the API uses Prisma. The web app never touches the database directly.

## D13. UI components {#ui-components}

- **Decision:** How UI components are built.
- **Options:** Hand-rolled Tailwind; shadcn/ui on Base UI, Radix, or React Aria.
- **Choice:** Tailwind CSS + shadcn/ui, `base-nova` preset on Base UI, Lucide icons.
- **Why:** shadcn copies component source into the repo (`components/ui/`), so every component
  is readable and editable, with no black-box library. Base UI is shadcn's current default and
  actively maintained.

## D14. Data model and synthetic data {#data-model}

- **Decision:** The shape of the customer's existing data, and what test data tells.
- **Options:** Leaner model without recalls; full model with recalls.
- **Choice:** Eight tables: `customers`, `vehicle_models` (factory specs), `vehicles` (VIN as
  primary key), `telematics_events`, `recalls`, `vehicle_recalls`, `cases`, `case_notes`.
  Seeded with five synthetic stories for a fictional make, Meridian Motors: a recurring fault,
  a symptom matching an open recall, a healthy new vehicle, a customer with two vehicles, and a
  fault that returned after a closed case.
- **Why:** Specs belong to the model, not the vehicle, which makes them the most cacheable data.
  VIN is the identifier reps already use. Recalls enable the highest-value connection the agent
  can make. Each story is also an eval case.
- **Notes:** Postgres 17 locally via Docker (host port 5440) to match Cloud SQL. Prisma pinned
  to 7.10.1 stable rather than the 8.0 release candidate. VINs use the made-up `0MR` prefix.

## D15. Where saved call summaries go {#save-target}

- **Decision:** Which record a reviewed call summary is attached to.
- **Options:** Always a new case; always the latest open case; a note on a case the rep picks.
- **Choice:** A `case_notes` row on a case the rep picks. Defaults to the vehicle's most recent
  open case; the rep can pick another or create a new case.
- **Why:** Mirrors real CRM workflow and avoids duplicate cases for repeat callers, while
  handling calls about something new.

## D16. Shape of the customer's API {#api-shape}

- **Decision:** Whether the GCP API returns raw records or agent-ready summaries.
- **Options:** Shaped around the data; shaped for the agent (pre-summarized endpoints).
- **Choice:** Shaped around the data. Six endpoints: customer by email, vehicle by VIN (with
  specs and recalls), telematics, cases (with notes), create case, add case note. One error
  shape: `{ error: { code, message } }`.
- **Why:** The customer's API already exists and shouldn't change to accommodate AI. All
  AI-specific logic stays on the Vercel side of the boundary; agent tools map 1:1 to endpoints.
- **Note:** Express has no auth code. Cloud Run IAM rejects unauthenticated callers before a
  request reaches the container (D3). A light rate limit is a backstop (D8; per calling system since D31).

## D17. How the web app knows the API's shapes {#contracts}

- **Decision:** Share types between API and web, or keep them separate.
- **Options:** Shared `packages/contracts`; web app owns its own Zod schemas.
- **Choice:** The web app defines its own Zod schemas in `lib/customer/` and validates every
  response from the GCP API.
- **Why:** In reality another team owns the customer's API; the Vercel app treats it as an
  external contract and checks it at the boundary. Cost: shapes are written twice.

## D18. Infrastructure as code {#terraform}

- **Decision:** How the GCP side is defined and changed.
- **Options:** Ad hoc gcloud commands; Terraform for GCP only; Terraform for GCP and Vercel.
- **Choice:** Terraform for GCP (`infra/`), state in a versioned GCS bucket. Resources first
  created with gcloud were adopted with `import` blocks (no recreation). Three things stay out:
  the running image (GitHub Actions deploys it; Terraform ignores image changes), Postgres
  GRANTs (inside the database; kept in `infra/sql/grants.sql`), and the Vercel project (its
  Terraform provider needs a long-lived Vercel API token).
- **Why:** The boundary (WIF trust, IAM bindings) is what reviewers will question, so it should
  be readable code. Constraint changes become reviewed diffs, and `terraform destroy` tears the
  demo down cleanly in a shared project.

## D19. Cloud Run → Cloud SQL access and region {#db-access}

- **Decision:** How the API connects and authenticates to Postgres, and where it all runs.
- **Options:** Connector + password; connector + IAM database login; private IP in a VPC.
- **Choice:** Cloud SQL connector with IAM database login, in `us-central1`. The database has a
  public IP with no authorized networks, so only the IAM-checked, mTLS connector can connect.
  The API's database user can read and write rows but not change the schema; migrations run as
  a separate human IAM login. Private IP is the documented production design.
- **Why:** Extends "no long-lived secrets" to the database: no database password exists.
  Builds run as a dedicated service account rather than the project's shared default account.

## D20. Boundary spike results {#spike}

- **Result:** The Vercel → GCP chain works end to end from a Vercel deployment: Vercel OIDC token
  → STS → `generateIdToken` for `vehicle-support-caller` → private Cloud Run (anonymous calls get
  403) → Cloud SQL via IAM login. The OIDC token is also reachable from inside a `"use cache"`
  function at request time, so the Cache Components plan (D6) stands with no fallback.
- **Implementation choice:** The federated credential calls `generateIdToken` directly (the
  Vercel project holds `serviceAccountOpenIdTokenCreator` on the caller account) rather than
  impersonating it first. One permission, one hop. The ID token is cached per Fluid Compute
  instance for about an hour.
- **Open:** Untested whether the token is available if cached functions run at build time
  (for example, prerendered vehicle pages). Check before prerendering anything that calls GCP.

## D21. Vercel function region {#function-region}

- **Decision:** Where Vercel Functions run.
- **Options:** `iad1` (default, Washington D.C.); `cle1` (Cleveland); multiple regions.
- **Choice:** `cle1`, set in `apps/web/vercel.json`.
- **Why:** Every request crosses to GCP `us-central1` (Iowa), often several times per agent run.
  `cle1` is the closest Vercel region to it, and Vercel recommends running functions next to
  their data. A single region is enough: users are internal support reps, and static and cached
  content is still served from Vercel's global CDN.
- **Trade-off:** If `cle1` has an outage, Vercel reroutes to the next closest region (failover
  ordering is automatic; per-function failover is Enterprise).

## D22. Staging and production environments {#environments}

- **Decision:** Whether the GCP side has one environment or two.
- **Options:** One environment shared by all Vercel deployments; staging + production.
- **Choice:** Two. `develop` deploys `vehicle-support-api-staging` (database
  `vehicle_support_staging`); `master` deploys `vehicle-support-api` (`vehicle_support`). Both
  databases share one Cloud SQL instance. Vercel Preview and Development use staging; Vercel
  Production uses production.
- **Isolation is enforced, not conventional:** separate runtime, caller, and deployer service
  accounts per environment. WIF maps `project:environment` from the Vercel token, so preview
  and development tokens can only become the staging caller and production tokens only the
  production caller. In Postgres, each database revokes `CONNECT` from `PUBLIC`; the staging
  accounts cannot even connect to the production database.
- **Why:** A preview deployment can never read or write production data, and the rollout plan
  (preview → staging → production) is real rather than described.
- **Cost:** One extra Cloud Run service (scales to zero) and one extra database on the existing
  instance. No new instance.

## D23. API deploy pipeline {#pipeline}

- **Decision:** How the GCP API is built, migrated, and released.
- **Choice:** GitHub Actions (`.github/workflows/deploy-api.yml`), on push to `develop` or
  `master`: build image → `prisma migrate deploy` through the Cloud SQL Auth Proxy → roll out
  the new revision. Auth via a second WIF provider for GitHub, trusted by immutable repository
  ID; each branch can only act as its environment's deployer. GitHub Environments add branch
  policies (production deploys only from `master`). Staging can be reseeded on demand
  (`workflow_dispatch`); production never is.
- **Options considered:** Migrations as a Cloud Run Job (keeps them inside GCP but needs a
  separate image with the Prisma CLI); Terraform plan/apply in CI (needs project-wide read
  access for GitHub's identity). Terraform stays local for this demo.
- **Why:** No stored GCP keys anywhere in CI. Migrating before deploying means a failed
  migration leaves the running revision untouched; migrations must be backward compatible
  (expand, then contract) because the old revision serves until the new one is ready.
- **Database ownership:** each environment's deployer owns its schema and is the only identity
  that changes it. The production tables, first created by a human login, were transferred to
  the production deployer (`infra/sql/grants.sql`).

## D24. Vehicle page rendering and caching {#vehicle-page-caching}

- **Decision:** What is static, cached, or fresh on `/vehicles/[vin]`, and where cached data lives.
- **Options (store):** plain `"use cache"` (in-memory per instance, free) or `"use cache: remote"`
  (Vercel Runtime Cache: shared by all instances in the region, isolated per environment).
- **Choice:** Static shell (layout, headings, skeletons) with three independently streamed panels:

  | Data | Strategy | Tag |
  |---|---|---|
  | Vehicle, specs, recalls | `use cache: remote`, `hours` (`minutes` if not found) | `vehicle:{vin}` |
  | Cases and notes | `use cache: remote`, `minutes`; cleared by `updateTag` on note save | `cases:{vin}` |
  | Telematics | Not cached; request time (`connection()`) | — |
  | Customer search by email | Not cached; server action, so the email never appears in a URL | — |

  No vehicle pages are prerendered at build time.
- **Why remote:** In-memory entries live per instance, so `updateTag` after a save could leave
  another instance serving old cases. The Runtime Cache is shared and environment-isolated,
  matching the staging/production split. Cost is fractions of a cent at demo traffic; it starts
  empty after each deploy.
- **Why these lifetimes:** Specs never change; recall status rarely does. Cases also change in
  the existing CRM, which never tells this app, so a short lifetime bounds staleness there.
- **Personal data:** Owner names, emails, and case descriptions are cached briefly, in one region
  (`cle1`), isolated per environment, evicted by lifetime. Flagged as a customer approval item.
- **Measured locally against staging:** first load ~5 s (staging scaled to zero, token exchange,
  connector setup); warm loads 0.08–0.3 s.

## D25. Vehicle agent {#agent}

*Data loading and the prompt were redesigned in D41; scope, models, and limits still hold.*

- **Decision:** How the AI assistant is scoped, powered, and bounded.
- **Choice:** A `ToolLoopAgent` (AI SDK 7) behind `POST /api/agent`, shown as a chat panel on
  the vehicle page with five canned prompts and visible tool calls.
  - **Tools:** `getVehicle`, `getTelematics`, `getCases`, mapping 1:1 to the GCP API and reusing
    the page's cached fetchers, so lookups are near-instant when the rep already has the page open.
  - **Scope:** tools take no VIN. The route passes the vehicle the rep has open, so no prompt can
    make the agent read another customer's record.
  - **Models:** Gemini 3.8 Flash on Vertex → Claude Sonnet 5.5 on Anthropic, `only: ["vertex",
    "anthropic"]` so each model runs only on the provider whose credits it should use (D11).
  - **Limits:** 6 steps, `reasoning: "low"`, last 10 messages, 2,000 characters per message.
    No output-token cap (see below). Rate limiting in front of the route comes with the Firewall
    step (D8).
  - **Grounding:** the prompt allows only facts the tools returned, cited with dates; says so when
    data is missing; refers to cases by subject and date, never internal IDs; ends with next steps.
- **Options considered:** letting the model choose the VIN (enables comparing a customer's
  vehicles, but a crafted prompt could pull any record); cheaper model pairs (Haiku, Flash Lite).
- **Found while testing:** Gemini's hidden reasoning tokens count toward `maxOutputTokens`; at the
  default depth it used the whole budget and cut answers off (`finishReason: "length"`).
  `reasoning: "low"` fixed it. The 1,000-token cap was then removed: a truncated answer is worse
  than a long one, and cost per message stays bounded by the step cap, input caps, and rate
  limiting. Dates are formatted in UTC so the page and the agent (which reads UTC timestamps) agree.

## D26. Call summary {#call-summary-generation}

- **Decision:** How a transcript becomes a saved case note.
- **Choice:**
  - **Fields** match `case_notes` exactly (issue, summary, next steps) plus a suggested subject and
    category used only for a new case. No database change.
  - **Generation:** one structured call (`streamText` + `Output.object`) with the vehicle, cases,
    and telematics loaded up front, rather than an agent loop. The draft streams into the form.
  - **Review:** nothing is saved until the rep edits and presses Save. The case picker defaults to
    the most recent open case, with a "New case" option (D15).
  - **Save:** a Server Action creates the case if needed, posts the note to GCP
    (`source: AI_DRAFT_EDITED`), then calls `updateTag('cases:{vin}')` so Case history shows the
    note on the next render instead of the cached list.
  - **Limits:** transcripts up to 15,000 characters (about a 15-minute call); field limits match
    the GCP API's validation.
  - **Safety:** the transcript is treated as untrusted content in the prompt, and the call has no
    tools, so instructions hidden in a transcript can't fetch or change anything.
- **Options considered:** extra fields (urgency, sentiment; needs a migration); reusing the agent
  with tools (flexible but multi-step, slower, harder to evaluate); a picker without "New case"
  (a vehicle with no cases couldn't save a summary).
- **Found while testing:** the model quoted internal case IDs despite a prompt rule. IDs are now
  stripped from everything the model sees (`lib/ai/model-context.ts`), for the agent too.
- **Risk to flag:** transcripts are personal data sent to the model providers (Vertex, Anthropic)
  under my BYOK agreements. Production answer: AI Gateway Zero Data Retention routing with
  ZDR-marked keys, and a retention review with the customer's privacy team.

## D27. Visual design system and assistant panel {#design-system}

- **Decision:** How the app looks beyond shadcn's neutral defaults, and where the assistant sits.
- **Options (look):** Calm utility (warm grays, one teal accent, dense); automotive dark (dark-first,
  instrument-cluster feel); friendly SaaS (bright, rounded, roomier).
- **Choice:** Calm utility, light theme only. Inter for UI, JetBrains Mono for VINs and fault codes.
  Tokens map onto shadcn's CSS variables in `app/globals.css`, plus `success`, `warning`, `info`,
  and `-soft` backgrounds for status. The assistant docks as a sticky 400px right column at `xl`
  (1280px+) and sits under the vehicle summary on smaller screens. (Docking breakpoint superseded by D28.)
- **Assistant panel:** tool calls show as "sources checked" chips (running, done, failed); answers
  render the agent's plain-text format (summary, bullets, a highlighted "Next steps" block)
  without a markdown parser; a Stop button replaces Ask while it streams; rate-limit and
  too-long errors get their own messages.
- **Why:** Reps scan this screen during a live call, so color is reserved for meaning and every
  status carries a word. Keeping the assistant in view lets the rep check its answer against the
  telematics and cases without scrolling away from it.

## D28. Vehicle status row and UI refinements {#vehicle-status}

- **Decision:** How the vehicle page answers "what's wrong with this car?" at a glance, how
  assistant answers point back into the record, and where the assistant docks.
- **"Recent" faults (status row):**
  - **Options:** 30 days; 7 days; any fetched event.
  - **Choice:** 30 days. Telematics has no active/cleared state, so a time window stands in for
    "still happening". 7 days hides a fault that came back three weeks ago; "any fetched event"
    depends on how many events the API returns. The real fix is a cleared flag in the customer's
    telematics API.
- **Status row rendering:**
  - **Options:** each item streams in its own `<Suspense>`; one boundary that waits for all three.
  - **Choice:** independent boundaries. Recalls arrive with the cached vehicle and show at once;
    cases (cached minutes) and telematics (fresh) stream in behind 120×28 skeletons, so the cached
    header never waits on fresh data (consistent with D24). Flex `order` keeps the worst-first
    sequence (critical, recalls, warning, cases) whichever arrives first.
  - The panel and the row share one telematics fetch and one clock reading per request (React
    `cache()`), so repeat counts ("3rd time") and relative times agree. Still never cached
    across requests.
- **References in assistant answers:**
  - **Options:** match fault codes and recall campaigns by pattern on the client; pass the
    vehicle's known codes and campaigns into the chat panel.
  - **Choice:** pattern matching. No new data flows to the panel; a reference becomes a link only
    if its target (`#dtc-<code>`, `#recall-<campaign>`) exists on the page, otherwise a plain chip.
    Cases stay text because the agent cites them by subject and date, never IDs (D26).
- **Assistant docking:** the assistant docks from `lg` (1024px, 360px wide; 400px from `xl`)
  instead of `xl`. Between 1024 and 1280px it used to fall below the record, which defeated
  keeping it in view. Telematics and cases sit side by side only at `xl` and stack at `lg`.
- **Assistant errors:** the route returns `{ error: { code } }` (`invalid_request`, `too_long`,
  `agent_failed`); failures after streaming starts are sent as the same JSON. The client maps a
  429 (from the Firewall, D8) to `rate_limited` by HTTP status, not by matching words.
- **Smaller calls:** severity and status always show as a word plus icon, never a raw enum;
  recalls use the warning tone (something to tell the customer, not an error); focus rings are a
  solid 2px teal outline (5.6:1 on the background, above the 3:1 minimum); telematics times are
  relative ("3 h ago", absolute after 60 days) while record dates stay absolute UTC to match what
  the assistant cites. Inputs opt out of password-manager autofill, since the app has no sign-in.

## D29. Rate limits on the public endpoints {#rate-limits}

- **Decision:** Where and how tightly to rate-limit the unauthenticated AI and save endpoints.
- **Options considered:** Vercel Firewall custom rules at the edge; `@vercel/firewall`
  `checkRateLimit()` inside the route (per-route logic, but the function already started); an
  in-app limiter on Redis (new service and cost); relying only on the Cloud Run backstop (doesn't
  protect model spend, which happens on Vercel).
- **Choice:** Two Vercel Firewall rate-limit rules, fixed 60-second window, keyed by IP, returning
  429:
  - `POST /api/agent` or `POST /api/call-summary`: 20 per minute. A rep asks a handful of
    questions per call; 20 is generous for a person and cheap for a script to hit.
  - Note saves (`POST /vehicles/*` with a `Next-Action` header, i.e. the Server Action): 30 per
    minute. These write to the customer's case system on GCP.
- **Config as code:** the rule JSON lives in `infra/vercel-firewall/` and is applied with
  `vercel firewall rules add` and `publish`.
- **Why the edge:** a blocked request never starts a function or reaches a model, so it costs no
  compute and no tokens.
- **Verified (Nov 2026):** 25 POSTs to `/api/agent` on a preview deployment returned 20 × 400
  (empty body) then 5 × 429. Project firewall rules apply to preview deployments too, not only
  production. Unauthenticated requests to a protected preview get 401 from Deployment
  Protection before the counter is reached.
- **Limits to flag:** per-IP limits don't bound total spend from many IPs, and counters are per
  region. The spend backstop is provider-side limits on the BYOK keys (Anthropic spend limit, GCP
  budget alert), since AI Gateway budgets don't cap BYOK (D9). In production, rep login (out of
  scope) would let the limit key on the user instead of the IP.

## D30. Evals {#evals}

- **Decision:** How to check that the agent and call summaries stay grounded, on both models.
- **Choice:**
  - **Harness:** Vitest, run on demand with `pnpm eval` (its own config, so no other test command
    spends tokens). Not in CI yet: real model calls cost money and aren't deterministic. The
    rollout plan lists CI evals on release PRs as the next step.
  - **What runs:** the real agent and the real call-summary request, with the model and data
    loaders injected. Each model runs alone with failover off (`evalModels`), so a score belongs
    to the model it names. Data comes from the staging API over the same OIDC → WIF path, minus
    the Next.js cache, fetched once per run.
  - **Grading:** deterministic only: expected tools called, required facts present, forbidden
    text absent (internal IDs, invented fault codes, assumed pronouns, promised loaners or
    buybacks, markdown). No LLM judge: free, stable, and every failure is explainable.
  - **Cases:** 8 agent cases and 2 call-summary cases built on the seeded stories (recurring
    fault, open recall, healthy car, fault returned after a closed case, missing data, a request
    for another customer's VIN, a prompt injection inside a transcript). Each runs 3 times and
    reports a pass rate per model, since one pass proves little.
- **Options considered:** HTTP against the running route (real path, but can't choose the model
  without a public override); recorded fixtures (fast, but skips the boundary and drifts with the
  relative seed dates); an LLM judge for qualities like "suggests escalation" (keywords cover it).
- **What the evals found, and what changed:**
  - Claude guessed gender from customer names ("ask him", "she"). Both prompts now say to use
    the name, "the customer", or "they". A prohibition alone didn't work; a positive alternative
    did.
  - Gemini skipped driver safety on a CRITICAL reduced-power fault and offered a loaner. The agent
    now puts safety first for CRITICAL driving faults and routes coverage, loaner, refund, and
    buyback requests instead of promising them.
  - Claude refused an injected instruction in a transcript but copied it into the summary. The
    note is saved and later read by the agent, so that is a stored prompt injection. The prompt
    now says to leave such instructions out of the note.
  - The seeded battery temperature had no unit; it now says °C.
  - The first wording of the "no promises" rule made Claude repeat the rule to the rep as a next
    step. It now applies only when the customer asks.
- **Results (3 runs per case, Nov 2026):** Gemini 30/30. Claude 28/30: once "his", and once it
  still mentioned the injected buyback request while saying it wasn't acted on. Tuning further
  would overfit ten prompts; the rep reviewing every note is the backstop. Gemini used about half
  the tokens per answer (~1,700 vs ~3,600) at similar median latency, which supports it as the
  primary model.
- **Also found:** run in parallel, the evals hit the vehicle API's 120/min per-IP limit. Both models
  handled the 429s well: they said the lookups failed and didn't guess. The limit's keying is a
  production concern of its own: see D31.

## D31. Vehicle API rate-limit keying {#api-rate-limit-keying}

- **Decision:** What the vehicle API's backstop rate limit (D8) counts per client.
- **Finding:** it counted per client IP, but the API's only client is the Vercel app. Every rep's
  traffic arrives from Vercel's shared outbound IPs, so the whole support team shared one
  120/min budget. One agent question costs up to 3 API calls; the evals hit the limit (D30).
- **Options considered:**
  - **A. Per calling system:** count by the service account in the Google ID token and size the
    limit for the whole app.
  - **B. Per rep:** Vercel forwards a rep identifier and the API counts by it. Duplicates the edge
    limit, and only means something once reps log in.
  - **C. No API limit:** rely on Cloud Run IAM, max instances, and the edge. Nothing protects the
    backend if the app misbehaves, e.g. a retry loop.
  - **D. Keep 120 per IP** and document it.
- **Choice:** A. Each layer has one job: the Vercel Firewall limits each person at the edge (D29),
  and the customer's API limits each calling system. 1,200/min per caller, set per environment in
  Terraform (`RATE_LIMIT_PER_MINUTE`), sized for about 100 reps each taking a few actions a
  minute. A second internal system calling the API would get its own budget automatically.
- **Why reading the token is safe:** Cloud Run IAM verifies the ID token before the request reaches
  the container, so the API reads the `email` claim without verifying it again. Locally there is
  no token, so the limiter falls back to the client IP.
- **Limits to flag:** counters live in each instance's memory, so with up to 3 instances the real
  ceiling is up to 3× the limit. A shared store (Redis/Memorystore) would make it exact; not worth
  it for a backstop. Once reps log in, both layers can key on the rep's ID.

## D32. Lookup suggestions and a page that fits the screen {#lookup-and-layout}

- **Decision:** How the vehicle page fits a laptop screen, where Call summary lives, how
  telematics units are shown, and what the lookup suggests.
- **Layout:** two independent columns instead of one grid with the assistant spanning rows. A
  fixed-height item spanning rows stretched them, leaving empty bands under shorter panels.
  - Left: header, then telematics and cases, as one flex column. Right: the assistant, sticky at
    72px (48px top bar + 24px) with `height: calc(100dvh - 6rem)`, so its input stays 24px above
    the bottom of the screen.
  - Below `lg` the left wrapper is `display: contents`, so `order` can place the assistant
    between the header and telematics without rendering it twice. Each panel keeps its own
    `<Suspense>` (D24).
  - A sticky top bar (product name, lookup, "Synthetic demo data") replaces "← New lookup".
    The landing page hides the bar's lookup and shows one large lookup instead, so `/` always
    has a single target.
  - Verified at 1280×800, 1440×900 (header, status row and the top of telematics and cases
    above the fold) and 1024×768 (cases stack under telematics there, per D28).
- **Call summary:**
  - **Options:** a tab beside "Ask" in the assistant panel; or stay in the left column, sized to
    its content.
  - **Choice:** a tab. Both tools draft for the rep, so they share the column; the left column
    stays pure record, and a saved note appears in Case history next to the panel. Both tabs
    stay mounted (Base UI Tabs, `keepMounted`), so switching never loses the chat or an unsaved
    draft. Staying in the left column pushed telematics and cases below the fold.
- **Telematics units:**
  - **Options:** derive the unit in the web app from the message text; add `unit` to the
    telematics API contract (D16/D17: migration, seed, API and schema changes).
  - **Choice:** derive it (`lib/format.ts`) from the message's trailing parenthesis: "(miles)",
    "(%)", "(°C)" (the seed gained "(°C)" in D30). `type` can't be used: `BATTERY` covers both
    pack temperature and state of health. Brittle by design; the production fix is a `unit` field
    in the customer's API. The agent still reads the raw message, so its answers don't change.
- **Lookup suggestions:**
  - **Options:** client-only (recents in this browser, demo stories, live VIN/email checks);
    server prefix search (`GET /customers/search?q=`); client-only with recents storing no
    owner name.
  - **Choice:** client-only. Prefix search on an unauthenticated public demo would let anyone
    list customer emails and VINs; it belongs behind rep sign-in (out of scope).
  - **Recents:** the last 5 vehicles opened, in `localStorage` (`vs:recent`), storing VIN,
    vehicle name and owner name, never emails, with a "Clear recent" item. The owner name is the
    minimum that makes a recent useful. In production this would be rep-scoped server storage.
  - A digit marks a VIN being typed (names and story labels never contain one), so only then is
    the input uppercased, stripped of spaces and dashes, and checked as a VIN.
- **Found while building:**
  - Base UI's Combobox resets the input to the selected value when it closes. The lookup never
    keeps a selection, so it ignores that reset and only typing changes the query.
  - Base UI adds a hidden form field, which disables the browser's "Enter submits a one-field
    form" rule. A visually hidden "Look up" submit button restores it.
  - Cache Components rejects reading the clock while prerendering, so the time used for
    "2 min ago" is taken when the list opens, not on render.

## D33. Save feedback for call notes {#save-feedback}

- **Decision:** How the rep knows a call note was saved, and what happens when a save fails.
- **Found:** a save that failed before the Server Action answered (the Firewall's 429 from D29, a
  dropped connection, a timeout) threw in the browser. The page's error boundary replaced the
  whole vehicle page with "Couldn't load this vehicle", and the rep's edits were lost. Reproduced
  by failing the save request in a browser test.
- **Pointing at the new note:**
  - **Options:** scroll to the note and flash it in place; re-sort cases by latest activity so
    the case with the new note moves to the top; a "Just saved" strip at the top of Case history.
  - **Choice:** scroll and flash in place. The action returns the new note's ID (the API already
    sends it), notes carry `#note-<id>` anchors, and the panel shows "Saved to case history",
    names the case, and links to the note. Case history keeps the case system's order: a note
    saved to an older case isn't at the top of the list, so the page points at it instead.
    Note IDs appear in the page's HTML only; the model still never sees them (D26).
- **Failures:** the rep's edits always stay in the form, and the error says what happened. Errors
  from the vehicle API are told apart by status (404: the case is gone; 400: the note was
  rejected, with the API's reason; 429: busy; anything else: unavailable). A save that never
  answers gets "The save didn't go through. Your edits are still here."
- **Retrying a half-finished "New case" save:**
  - **Options:** web only (return the created case's ID with the error, switch the picker to it,
    so the retry adds only the note); one API call that creates the case and its first note in
    one transaction (changes the customer's API, D16/D17); document only.
  - **Choice:** web only. Before this, a retry after the note failed created a second case. The
    case can still be left without a note if the rep gives up; one transactional call in the
    customer's API is the production fix.
- **Verified (Nov 2026):** a failed save (faked 429 and dropped connection) keeps the page and
  the edits and shows the error; one real save on staging (Jordan's Aster, existing case)
  showed the confirmation and highlighted the note. The half-finished "New case" path was checked
  by reading the code only; it can't be triggered from the browser.

## D34. Spend alerts on the model providers {#spend-alerts}

- **Decision:** What stops runaway model spend beyond per-IP rate limits, which many IPs can get
  around (D29).
- **Options considered (GCP):** a budget alert in Terraform; an alert plus a lower Vertex
  requests-per-minute quota (a real ceiling, but set outside Terraform and project-wide); a
  budget that unlinks billing through Pub/Sub (a true stop, but it would shut down every
  workload in this shared project).
- **Choice:**
  - **Vertex:** a $25/month budget (`infra/budget.tf`) on the Vertex AI and Gemini API services
    in this project. It emails the billing account's admins at 50%, 90%, and 100% of actual
    spend and at 100% of forecast spend.
  - **Anthropic:** a $25/month spend limit set in the Anthropic console, which is a hard stop.
    Claude only runs as the fallback (D11), so normal use barely touches it.
- **Sizing:** a Gemini answer is roughly 1,700 tokens, a fraction of a cent. Normal demo traffic
  is under $1 a month; one IP holding the 20/min edge limit all day would cost tens of dollars.
  $25 never fires on normal use, and the 50% email comes within hours of real abuse.
- **Detail that matters:** the budget measures spend *before* credits
  (`EXCLUDE_ALL_CREDITS`). Usage here is paid from GCP credits, so a budget measured after
  credits would read $0 and never alert.
- **Limits to flag:** GCP budgets alert, they don't stop, and billing data lags by hours. AI
  Gateway budgets don't cover BYOK (D9). In production I'd add Vertex quotas per model and route
  alerts to an on-call channel rather than email.

## D35. Tests {#tests}

- **Decision:** Which behaviors to test, where, and how, without growing the suite past what earns
  its keep.
- **Choice:**
  - **API (`services/vehicle-api/test/`):** about 40 tests against a real Postgres, calling the
    real Express app over HTTP. The contract the web app reads (shapes, ordering, limits), privacy
    (no phone number returned), bad input (malformed VINs, emails, limits, note fields, malformed
    JSON, oversized bodies), write rules (case ownership, note ownership: D36), and the per-caller
    rate limit (D31).
  - **Web (`apps/web/**/*.test.ts`):** about 90 small unit tests in Node: lookup parsing of pasted
    text, telematics repeat counts and the "recent" window, formatting, the answer parser, recents
    surviving corrupt or blocked storage, no internal ID reaching the model, the agent and summary
    routes rejecting bad input before any model call (D38), and the save action's validation,
    error messages, and partial-failure retry.
  - **Model behavior stays in evals (D30, D37):** whether the model says the right thing isn't a
    unit test.
  - **CI:** `.github/workflows/test.yml` runs typecheck, lint, and both suites on every PR and on
    `develop`/`master`, with Postgres as a service container. No secrets, no tokens.
- **Options considered:** mocking Prisma (the API's behavior lives in its queries, so this tests
  the mocks); component tests with Testing Library (2–3 new dependencies; the logic worth testing
  is in the action); Playwright end to end (slow and flaky for this scope; listed in the rollout
  plan); running tests only locally (nothing would stop a regression from merging).
- **Safety:** the API tests refuse any database whose name doesn't end in `_test`, because the seed
  deletes every row first. That guard came from a real near miss: Vitest's `test.env` doesn't reach
  `globalSetup`, so the first version pointed at the dev database. Prisma's own guard against AI
  agents running `migrate reset` stopped it, and the setup now uses the non-destructive
  `migrate deploy`.

## D36. Notes can only land on the vehicle's own cases {#note-ownership}

- **Decision:** Where to enforce that a saved note belongs to a case on the vehicle the rep has
  open.
- **Finding:** the save action posted whatever case ID the browser sent, and the API didn't check
  the case's vehicle. A server action is a public POST endpoint and case IDs are in the page, so a
  stale tab or a crafted request could attach a note to another customer's case.
- **Options considered:** check in the API (the note body carries the VIN; the API refuses a case
  that isn't that vehicle's); check in the web action (compare against `getCases(vin)`, one extra
  read, and only this client is protected).
- **Choice:** the API. `POST /cases/:id/notes` now requires `vin` and returns 404 unless the case
  belongs to it. The system of record enforces its own integrity, so every client gets it. The web
  app sends the VIN it has open.
- **Rollout note:** this is a required field, so the API and web app ship together. In a real
  integration I'd accept the VIN as optional first, then require it once every client sends it.

## D37. Transcripts that aren't vehicle support calls {#junk-transcripts}

- **Decision:** What the call summary does with a transcript that isn't a real support call.
- **Finding:** with nothing to summarize, the model presented the vehicle record as the call. A
  transcript of "." produced the issue "Recurring battery coolant pump faults and reduced
  propulsion power". A dealership-hours call got next steps about the fault code.
- **Options considered:** prompt rules alone; prompt rules plus a `callType` field the UI can act
  on; refusing short transcripts on the server (brittle: real short calls exist).
- **Choice:** prompt rules plus `callType` (`vehicle_issue`, `other`, `no_conversation`) in the
  draft schema. The issue and summary come only from what was said; the record grounds next steps
  for the issue actually raised. Anything other than `vehicle_issue` shows a warning in the review
  form. The field isn't saved, so the database doesn't change, and it gives the evals something
  exact to check instead of phrasing.
- **Length limits in the draft schema:** stated in descriptions, not enforced. The browser validates
  the streamed draft against the same schema, so a draft one character over would silently vanish.
  The save action instead names the field that's too long.
- **Results (3 runs per case):** `callType` was right in every run. With 7 summary and 10 agent
  cases, Gemini passed 51/51 and Claude 50/51. Claude's miss was real: one "his" despite the
  pronoun rule. Gemini's reported miss was a grader bug: "call Dana Whitfield back" didn't match
  a pattern that only allowed "call the customer back", so the check now allows a name between. Off-topic requests are now declined in one line, and the
  agent still corrects a false claim that the recall repair costs $400.

## D38. What the agent route accepts {#agent-request}

- **Decision:** How strictly the public agent route checks the conversation the browser sends.
- **Finding:** it accepted any role, any part type (a 27KB file part got past the 2,000-character
  cap), and an empty question (the model still ran). A forged `system` message was blocked by the
  AI SDK, but only as a generic error after streaming started.
- **Options considered:** an allow-list of what the chat UI sends; rebuilding the history as plain
  text (stricter, but the agent would re-fetch data on every follow-up).
- **Choice:** the allow-list, in `lib/ai/agent-request.ts`: roles `user` and `assistant` only, user
  messages text-only, a non-empty last question, 2,000 characters per question, and 80,000
  characters across the last 10 messages, measured after trimming so long conversations aren't
  refused for messages the model never sees. Assistant parts stay, so follow-ups keep their tool
  results. Rejections return 400 or 413 before any model call.
- **Sizing:** I proposed about 40,000 characters, then measured: each assistant turn carries its
  tool results, and a real customer with years of cases makes those far larger than the seed. 80,000
  is about 20,000 tokens, roughly a cent on Gemini, and still blocks megabyte-sized abuse.
- **Limit to flag:** an attacker can still forge earlier assistant turns, but only in their own
  session, and the tools can only read the vehicle the route names (D25).

## D39. The customer's current state {#current-state}

- **Decision:** What Meridian's console runs on today, which the proposal and architecture
  diagrams compare the build against.
- **Options:** A client-rendered single-page app served from one region; Next.js self-hosted on
  GKE behind Cloud CDN, with an assistant already built on Vertex AI; the same app on VMs; a
  shared Next.js cache on Redis (Memorystore).
- **Choice:** Next.js on GKE in `us-central1` behind Cloud CDN and a load balancer, with Next.js's
  default cache on each pod's own disk. An assistant route calls Gemini through the Vertex AI SDK,
  with hand-written tool calls. Releases go through Cloud Build and Argo CD to one shared staging
  namespace. The APIs and Postgres sit in the private network.
- **Why:** An enterprise that has invested in this console would already have a CDN and a modern
  framework, and a reviewer would see through a weaker starting point. The case then rests on
  what a CDN can't fix (personal vehicle pages render at origin), what self-hosting Next.js costs
  (a cache per pod, upgrades, version skew during rolling deploys), the missing per-change
  previews, and a single-provider assistant. It uses all three roles cleanly: replace the
  self-hosted Next.js platform, augment the Vertex agent with AI Gateway (Gemini on Vertex stays
  primary, D11), and connect to the systems that stay.
- **Why no Redis:** a shared cache handler is built for content-heavy sites with ISR, not a
  per-customer internal tool, and it's one more system for the app team to run. With a cache on
  each pod, specs and recalls are reused, but cases go uncached: a saved note clears only the pod
  that handled the save, and every rolling deploy or scale-out starts with empty caches. A shared
  Runtime Cache with `updateTag` on save (D24) is what makes caching cases safe.
- **Relation to D1:** D1's Connect role and scope stand. The lead pain moves from "reps assemble
  each vehicle's story across screens" to slow dynamic pages, self-hosting cost, and an
  assistant with no fallback; the screens problem remains as a secondary pain.
- **Honest limits:** Vercel Functions still run in one region next to the data (D21), so the
  gain for advisors abroad is the prerendered shell from the edge and panels that stream as
  they're ready, not faster data. In this build the vehicle API runs on Cloud Run as a stand-in
  for Meridian's existing GKE services; in their environment those stay put behind an
  identity-checked internal endpoint.

## D40. Error states in the UI {#error-states}

- **Decision:** How the UI handles each failure the testing turned up.
- **Findings:** one failing panel replaced the whole vehicle page (an error in a panel inside
  `<Suspense>` bubbles to the page's `error.tsx`); the lookup page had no error boundary, so a
  down customer system showed Next's default error screen; a call-summary draft that failed schema
  validation vanished silently (`useObject` reports it only to `onFinish`); every call-summary
  failure showed the same message, including rate limits; the chat had no retry.
- **Choice:**
  - **Panels fail alone:** `lib/load-panel.ts` catches a panel's fetch failure and the panel shows
    "Telematics couldn't be loaded… The rest of the record is still current" with Retry
    (`router.refresh()`). `unstable_rethrow` lets Next's own control-flow errors through:
    `connection()` postpones prerendering by throwing, and swallowing that would break the static
    shell. Verified by simulating a telematics outage, and the build still shows the page as
    Partial Prerender.
  - **Lookup:** the search action returns an inline error when the customer system is down;
    `app/error.tsx` is the last resort.
  - **One error vocabulary for both AI features** (`lib/ai-request-error.ts`): the call-summary
    route now answers `{ error: { code } }` like the agent route, a custom `fetch` on `useObject`
    tags Firewall 429s, and both features show the same wording for the same failure. An incomplete
    draft says so and keeps the transcript.
  - **Chat:** a failed answer offers Try again (`regenerate()`).
- **Options considered:** a client error boundary per panel (catches render errors too, but needs a
  class component or a dependency, and server-side failures are the ones that happen here).

## D41. Load the record before the agent runs {#agent-context}

- **Decision:** Whether the agent fetches the vehicle's data itself (a tool loop) or gets it up
  front, and how its prompt is built.
- **Finding:** in every eval run, both models called all three tools for every question, usually
  in one parallel step. That first model round-trip decided nothing.
- **Options considered:**
  - **Load up front, keep a tool for depth:** the route loads the record; one optional tool for
    older telematics.
  - **Force the first step to call the tools** (`prepareStep` with `toolChoice`): keeps the loop,
    but Claude rejects forced tool choice with thinking on, so the fallback would fail.
  - **Keep the loop as it was.**
- **Choice:** load up front (research: Anthropic's "Building effective agents" and "Effective
  context engineering").
  - **The record:** vehicle, cases, and the 20 newest telematics events, loaded with the page's
    cached fetchers. It goes in as its own system message, in `<vehicle_record>` tags, after a
    static prompt that providers can cache. A source that fails is marked `unavailable` and the
    model says so (as the page does, D40).
  - **Shaped for the model** (`lib/ai/model-context.ts`): no internal IDs, dates already in
    "Nov 9, 2026" form, and repeat counts per fault code computed in code. The call summary uses the
    same formatter.
  - **One tool:** `getTelematics` for history older than the record, with a fuller description of
    when to use it. Step cap 3.
  - **The prompt:** sections (`<role>`, `<grounding>`, `<output_format>`, `<safety_and_policy>`,
    `<examples>`), rules stated with their reasons, and three short examples about a fictional
    vehicle (a recurring fault, a safety-first answer, an off-topic decline).
  - **History:** earlier turns' tool results are dropped on the server. They came from the browser,
    so they could be forged, and the record is reloaded each turn. Text and reasoning parts stay,
    because Gemini needs its reasoning sent back as it was.
  - **AI Gateway:** `caching: 'auto'` (Anthropic needs it; Gemini caches on its own) and
    `tags: ['feature:agent' | 'feature:call-summary']` for spend and latency by feature.
- **Results (10 agent cases × 3 runs, same cases before and after):**

  | | Before | After |
  |---|---|---|
  | Gemini pass rate · median · tokens | 30/30 · 4.7s · 1,416 | 30/30 · 2.6s · 1,602 |
  | Claude pass rate · median · tokens | 29/30 · 5.4s · 3,399 | 30/30 · 4.0s · 2,696 |
  | Model steps per answer | 2 | 1 |

  Gemini uses slightly more tokens (the examples and the record ride on every request), but
  answers almost twice as fast. Claude made no pronoun slips in 30 answers after the rule gained
  its reason. Call summaries: 21/21 on both models.
- **Found while testing:** Claude classified a call about a *different* vehicle as `other`, because
  `vehicle_issue` said "the vehicle". It now says "a vehicle, even one that may not match the
  record", so the mismatch lands in the next steps instead of a misleading "not a vehicle issue"
  warning.
- **Not adopted from the research:** an output-token cap (D25 decided against it); provider
  timeouts for Gemini's slow tail (whether a timeout falls through to Claude is unverified, so
  check Gateway Logs first); OpenTelemetry tracing (two new packages; listed as a production step).
- **Trade-off for the interview:** the assistant does less visible "agent" work: the "sources
  checked" chips appear only when it reaches for older telematics. The evals showed the loop added
  nothing, so the decision moved into code, and the tool stays for the one choice the model
  really makes.
