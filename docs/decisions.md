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
- **Resolved:** see D28. The output-token cap was dropped (D25).

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
  request reaches the container (D3). A light rate limit (120/min per IP) is a backstop (D8).

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

## D28. Rate limits on the public endpoints {#rate-limits}

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
