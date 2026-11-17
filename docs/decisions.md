# Decisions

The architectural decisions behind this build, numbered in the order they were made. Where one
lands in code, a `Decision (Dnn)` comment marks the line. Commits before Nov 16, 2026 use earlier
numbers; see [Renumbering](#renumbering).

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
  transcripts · [D33](#cost-per-run) Cost per run · [D19](#evals) Evals
- **Data integrity:** [D6](#data-model) Data model · [D25](#note-ownership) Note ownership ·
  [D22](#save-feedback) Save failures
- **Release path:** [D9](#terraform) Terraform · [D12](#environments) Environments ·
  [D13](#pipeline) API pipeline · [D35](#rollout) Rollout · [D32](#release-versions) Versions ·
  [D24](#tests) Tests
- **Protection and spend:** [D18](#rate-limits) Edge rate limits · [D20](#api-rate-limit-keying)
  API rate limit · [D27](#agent-request) Agent request checks · [D23](#spend-alerts) Spend alerts

---

## D1. Scenario {#scenario}

- **Choice:** Meridian Motors (fictional) is rebuilding its advisors' support console, a React
  app on Google Cloud, in Next.js on Vercel, screen by screen. The vehicle workspace moves first
  and gains an AI assistant. The API and database stay on Google Cloud.
- **Options:** a new Vercel-hosted assistant beside the existing app (Connect only); a full
  rebuild at once; a screen-by-screen rebuild.
- **Why:** based on a support tool I worked on. Advisors assemble a vehicle's story from several
  screens; one workspace and an assistant fix that, and a screen-by-screen rebuild lets a pilot
  group validate each screen before everyone switches (D35).

## D2. GCP backend {#gcp-backend}

- **Choice:** Express on Cloud Run, Cloud SQL Postgres, Prisma owned by the API.
- **Options:** Cloud Run + Firestore; external Postgres (Neon).
- **Why:** a realistic system of record in the customer's cloud. The API is the only path to the
  database; Vercel never connects to Postgres.

## D3. Authenticating across the boundary {#boundary-auth}

- **Choice:** Vercel OIDC token → Workload Identity Federation → `generateIdToken` for a caller
  service account → Cloud Run IAM. The ID token is cached per function instance for about an
  hour.
- **Options:** a shared API key (a long-lived secret to leak and rotate).
- **Why:** no stored secret, access scoped per Vercel project and environment (D12), and
  anonymous calls get 403. GitHub Actions deploys the same way (D13).
- **Verified:** end to end from a Vercel deployment, including inside a `"use cache"` function.
- **Production option:** if Meridian's policy requires private APIs, Vercel Secure Compute and a
  site-to-site VPN to an internal load balancer (Enterprise).

## D4. Vercel primitives {#primitives}

- **Choice:** AI SDK, AI Gateway, Cache Components with the Runtime Cache, Fluid compute, Vercel
  Firewall, Preview Deployments.
- **Not now:** Workflows. Every AI request is short, read-only until Save, and cheap to retry. It
  earns its place once summaries need a supervisor's approval.
- **Why Fluid compute:** agent requests mostly wait on the model; one instance serves many and
  bills active CPU (D34).

## D5. Models and failover {#models}

- **Choice:** Gemini 3.8 Flash on Vertex (BYOK, Meridian's GCP commitment) → Claude Sonnet 5.5 on
  Anthropic (BYOK) → Vercel's keys (AI Gateway's automatic retry). `only: ["vertex",
  "anthropic"]` keeps each model on its billing provider.
- **Options:** Vercel keys only; Gemini → Claude, both on Vertex.
- **Why:** two vendors on two clouds survive a Vertex-wide failure. Claude on Vertex shares the
  primary's failure modes and needs Model Garden setup.
- **Consequences:** the Vertex BYOK key is the system's one long-lived credential (Vertex AI User,
  stored only in AI Gateway). Gateway budgets don't cap BYOK spend (D23). Answers differ by model,
  so evals run on both (D19). Fallback sends data outside GCP.

## D6. Data model {#data-model}

- **Choice:** `customers`, `vehicle_models` (specs), `vehicles` (VIN key), `telematics_events`,
  `recalls`, `vehicle_recalls`, `cases`, `case_notes`. Five synthetic stories: a recurring fault,
  a symptom matching an open recall, a healthy vehicle, a two-vehicle customer, a fault that
  returned after a closed case.
- **Why:** specs belong to the model, so they cache best. VIN is what advisors use. Recalls give
  the agent its most valuable connection. Each story is an eval case.

## D7. API shape {#api-shape}

- **Choice:** shaped around the data, not the agent: customer by email, vehicle by VIN (with
  specs and recalls), telematics, cases with notes, create case, add note, close case. One error
  shape, `{ error: { code, message } }`. No auth code in Express; Cloud Run IAM rejects callers
  first (D3).
- **Why:** the customer's API shouldn't change for AI. AI logic stays on the Vercel side.

## D8. Contracts {#contracts}

- **Choice:** the web app keeps its own Zod schemas in `lib/customer/` and validates every
  response.
- **Options:** a shared `packages/contracts`.
- **Why:** another team owns the API in reality, so it's an external contract checked at the
  boundary. Cost: shapes are written twice.

## D9. Infrastructure as code {#terraform}

- **Choice:** Terraform for GCP in `infra/`, state in a versioned GCS bucket. Outside it: the
  running image (GitHub Actions), Postgres GRANTs (`infra/sql/grants.sql`), the Vercel project
  (its provider needs a long-lived token). Firewall rules are JSON in `infra/vercel-firewall/`,
  applied with the Vercel CLI.
- **Why:** the boundary (WIF trust, IAM bindings) is what gets questioned, so it's reviewable code.

## D10. Cloud Run → Cloud SQL {#db-access}

- **Choice:** Cloud SQL connector with IAM database login, in `us-central1`. Public IP with no
  authorized networks, so only the IAM-checked connector connects. The API's user can't change
  the schema; migrations run as the deployer (D13). Private IP is the production design.
- **Why:** no database password exists.

## D11. Function region {#function-region}

- **Choice:** `cle1` (Cleveland), set in `apps/web/vercel.json`.
- **Why:** every dynamic request crosses to `us-central1` (Iowa), and `cle1` is the closest Vercel
  region. The static shell still comes from the global edge.
- **Trade-off:** one region; Vercel reroutes to the next closest if it fails.

## D12. Environments {#environments}

- **Choice:** staging (`develop`) and production (`master`) API services and databases on one
  Cloud SQL instance. Vercel Preview and Development use staging; Production uses production.
- **Enforced:** separate service accounts per environment; WIF maps the token's environment, so a
  preview can only become the staging caller; each database revokes `CONNECT` from `PUBLIC`.
- **Why:** a preview can never touch production data.

## D13. API pipeline {#pipeline}

- **Choice:** GitHub Actions on push to `develop` or `master`: build → `prisma migrate deploy`
  through the Auth Proxy → new revision. Auth through a GitHub WIF provider trusted by repository
  ID; each branch acts only as its environment's deployer. The web app deploys separately through
  Vercel's Git integration.
- **Options:** migrations as a Cloud Run Job; Terraform in CI.
- **Why this order:** a failed migration leaves the running revision untouched. Migrations are
  expand-then-contract, since the old revision serves until the new one is ready.

## D14. Vehicle page caching {#vehicle-page-caching}

- **Choice:** a static shell with independently streamed panels:

  | Data | Strategy | Tag |
  |---|---|---|
  | Vehicle, specs, recalls | `use cache: remote`, `hours` (`minutes` if not found) | `vehicle:{vin}` |
  | Cases and notes | `use cache: remote`, `minutes`; `updateTag` on save | `cases:{vin}` |
  | Live telematics, agent | Not cached (`connection()`) | — |
  | Settled telematics windows | `use cache: remote`, `days` (D37) | `telematics:{vin}` |
  | Customer search by email | Not cached; Server Action, so no email in a URL | — |

- **Why remote:** in-memory caches are per instance, so a save could leave another instance
  serving old cases. The Runtime Cache is shared per region and environment; it starts empty after
  each deploy.
- **Staleness accepted:** CRM changes (a completed recall, new owner details) can show for about
  an hour.
- **Personal data:** owner details cached up to a day, case text up to an hour. A customer
  approval item.
- **Production path:** the CRM sends change events to a route that revalidates the VIN's tags.

## D15. Agent {#agent}

- **Choice:** an AI SDK `ToolLoopAgent` behind `POST /api/agent`, in the vehicle page's chat.
  - **Scope:** the route supplies the open vehicle; the model can't choose a VIN.
  - **Limits:** step cap, `reasoning: "low"`, last 10 messages, request checks (D27).
  - **Grounding:** only facts from the record or a tool, with dates; says when data is missing; no
    internal IDs; ends with next steps.
- **No output cap:** Gemini's hidden reasoning counts toward it, and at 1,000 tokens answers were
  cut off. Cost is bounded elsewhere (D33).
- Data loading and the prompt were redesigned in D30.

## D16. Call summary {#call-summary-generation}

- **Choice:** one structured call (`streamText` + `Output.object`) with the record loaded, filling
  the `case_notes` fields (issue, summary, next steps) plus subject and category for a new case.
  The advisor edits and presses Save; a Server Action writes the note (`AI_DRAFT_EDITED`) and
  calls `updateTag`. The case picker defaults to the open case, else the newest open one.
- **Limits:** 15,000 characters per transcript. No tools, so injected instructions can't act.
- **Options:** display only; the agent with tools; always a new case.
- **Risk:** transcripts are personal data sent to model providers. Production: Zero Data
  Retention routing and a privacy review.

## D17. Status row {#vehicle-status}

- **Recent faults:** the last 30 days, standing in for "still active" since telematics has no
  cleared flag (the real fix belongs in the API).
- **Rendering:** each status item streams on its own; panel and row share one telematics fetch per
  request (React `cache()`), so counts agree.
- **Links:** fault codes and recalls in answers become links only if they exist on the page.

## D18. Edge rate limits {#rate-limits}

- **Choice:** two Vercel Firewall rules, per IP, 60-second window, 429: AI routes at 20 a minute,
  note saves at 30.
- **Options:** `checkRateLimit()` in the route; Redis; only the Cloud Run backstop.
- **Why the edge:** a blocked request starts no function and calls no model.
- **Limits:** contact-center advisors share office IPs, so per IP doesn't fit production. With
  Entra ID sign-in, limits key on the advisor through `checkRateLimit()` with a `rateLimitKey`.
  Spend from many IPs is bounded by D23.

## D19. Evals {#evals}

- **Choice:** Vitest, on demand (`pnpm eval`). Runs the real agent and call summary against
  staging over the real boundary, each model alone, 3 runs per case. Deterministic grading:
  required facts present; internal IDs, invented codes, assumed pronouns, promises and markdown
  absent. 10 agent and 7 call-summary cases, including another customer's VIN and a prompt
  injection.
- **Options:** HTTP against the route; recorded fixtures; an LLM judge.
- **What they caught:** Claude guessing pronouns; Gemini skipping driver safety and offering a
  loaner; Claude copying an injected instruction into a note; a tool loop that added nothing
  (D30).
- **Results (Nov 2026):** agent 30/30 and call summaries 21/21 on both models. Next: run on
  release PRs.

## D20. API rate-limit keying {#api-rate-limit-keying}

- **Finding:** the API's limit counted per IP, but all traffic arrives from Vercel's shared IPs,
  so every advisor shared 120 a minute.
- **Choice:** count per calling service account (from the IAM-verified token), 1,200 a minute,
  set per environment. The edge limits people (D18); the API limits systems.
- **Limit:** counters are per instance, so the ceiling is up to 3×. Fine for a backstop.

## D21. Lookup {#lookup-and-layout}

- **Suggestions:** client-only (recent vehicles, live VIN and email checks). Server prefix search
  would let anyone list customers on a public prototype; it belongs behind sign-in.
- **Recents:** last 5 vehicles in `localStorage`, never emails.
- **Units:** derived from the message's trailing "(miles)", "(%)" or "(°C)". The fix is a `unit`
  field in the API.
- **Layout:** Ask and Call summary are tabs that stay mounted, so neither loses its state.

## D22. Save failures {#save-feedback}

- **Finding:** a failed save threw in the browser and the error page wiped the advisor's edits.
- **Choice:** edits always stay in the form, and the error says what happened (404, 400 with the
  reason, 429). A new case and its first note are written in one transaction (`POST /cases`), so a
  retry is the whole save again.

## D23. Spend alerts {#spend-alerts}

- **Choice:** a $25/month budget alert on Vertex AI and Gemini spend (`infra/budget.tf`) and a
  $25/month hard limit on Anthropic.
- **Options:** a lower Vertex quota; a budget that unlinks billing (stops every workload in the
  project).
- **Detail:** the budget measures spend before credits, or it would read $0 and never alert.
- **Limit:** GCP budgets alert but don't stop, and lag by hours. Production: quotas per model and
  alerts to on-call.

## D24. Tests {#tests}

- **Choice:** API tests against real Postgres through the real app (contracts, privacy, bad
  input, ownership, rate limits); about 100 web unit tests (parsing, request checks, save errors).
  CI runs both on every PR without secrets. Model behavior stays in evals.
- **Options:** mocking Prisma; component tests; Playwright.
- **Safety:** API tests refuse any database not ending in `_test`, since the seed deletes rows.

## D25. Note ownership {#note-ownership}

- **Finding:** a crafted Server Action request could attach a note to another customer's case.
- **Choice:** the API checks that the case belongs to the note's VIN, so every client is
  protected, not just this one.
- **Rollout:** a new required field, so the API ships first.

## D26. Non-support transcripts {#junk-transcripts}

- **Finding:** given nothing to summarize, the model presented the vehicle record as the call.
- **Choice:** prompt rules plus a `callType` field (`vehicle_issue`, `other`, `no_conversation`);
  anything else shows a warning in the review form. Not saved, but exact for evals.
- **Length limits** in the draft schema are stated, not enforced, so an over-long draft doesn't
  vanish in the browser; the save action names the field instead.

## D27. Agent request checks {#agent-request}

- **Finding:** the route accepted any role, any part type and empty questions.
- **Choice:** an allow-list (`lib/ai/agent-request.ts`): `user` and `assistant` roles, text-only
  user messages, 2,000 characters per question, 80,000 across the last 10 messages. Rejections
  return 400 or 413 before any model call.
- **Limit:** a caller can forge earlier assistant turns, but only in their own session.

## D28. Current state {#current-state}

- **Choice:** a React app built with Vite, served from Cloud Storage behind Cloud CDN, with
  Microsoft Entra ID sign-in. The browser calls REST services on Cloud Run in `us-central1`.
  Cloud Build uploads each release to the bucket; one shared staging. About 80 advisors in North
  America, Europe and the Middle East.
- **Options:** Next.js already self-hosted on GKE; the same app on VMs.
- **Why:** the typical way a mid-market company runs an internal React app, and its problems are
  ones a platform and framework fix: slow screens far from Iowa, one shared staging, APIs exposed
  to the browser, and nowhere to run an assistant.
- **Alternative Meridian weighed:** Next.js on Cloud Run, which means owning scaling, the CDN
  setup, previews and rollbacks.
- **Honest limit:** functions run in one region next to the data (D11), so the gain abroad is the
  edge-served shell and streamed panels, not faster data.

## D29. Error states {#error-states}

- **Findings:** one failing panel replaced the whole page; the lookup had no error boundary; an
  invalid draft vanished; the chat had no retry.
- **Choice:** panels catch their own failures and offer Retry (`lib/load-panel.ts`, with
  `unstable_rethrow` so prerendering still works); the lookup shows inline errors; both AI routes
  share one error shape; a failed answer offers Try again.

## D30. Record up front {#agent-context}

- **Finding:** both models called all three tools for every question, so the first round trip
  decided nothing.
- **Choice:** load the vehicle, cases and 20 newest telematics events from the page's cached
  fetchers, as a second system message after a static, cacheable prompt. No internal IDs, dates
  pre-formatted, repeat counts computed in code. One tool, `getTelematics`, for older history;
  step cap 3. Earlier tool results from the browser are dropped. AI Gateway `caching: 'auto'` and a
  `feature:` tag per route.
- **Options:** force the first step to call tools (Claude rejects it with thinking on); keep the
  loop.
- **Results:** Gemini 30/30 at 2.6 s median (was 4.7 s); Claude 30/30 (was 29/30) at 4.0 s (was
  5.4 s) with about 20% fewer tokens.

## D31. Case view {#case-view}

- **Choice:** `/vehicles/[vin]/cases/[caseId]` with status, an overdue banner, a quick note, Close
  with a required resolution, the activity thread and related faults. No schema change. The
  assistant lives in the vehicle layout, so chat and drafts survive navigation.
  - **Close:** `POST /cases/:id/close`, ownership-checked (D25), 409 if already closed.
  - **Overdue:** open with no note for 5 business days; a desk policy, so computed in the web app.
  - **Related faults:** coded faults in the 7 days before the case opened, labelled as a date
    match.
- **Cut:** escalation, case numbers, owner, priority and dealer repairs. They need advisor identity, a
  migration or another system.

## D32. Release versions {#release-versions}

- **Choice:** date-based, `release/26.11.15.1` and tag `v26.11.15.1`. A date tells support which
  build is live; this is an app, not a library. `package.json` stays semver.
- **First release:** production was reseeded once by hand through the Auth Proxy, with a
  temporary password rotated afterwards; never from CI.

## D33. Cost per run {#cost-per-run}

- **Choice:** read the cost AI Gateway returns on every response (`marketCost`, list price, since
  BYOK `cost` is 0). `lib/ai/usage.ts` logs one `ai_usage` line per answer; evals report averages.
- **Options:** a price table in the repo; dashboard totals only.
- **Measured (Nov 2026, per answer):**

  | | Gemini 3.8 Flash | Claude Sonnet 5.5 |
  |---|---|---|
  | Agent answer | $0.0019–0.0020 | $0.0042–0.0059 |
  | Call summary | $0.0019 | $0.0039–0.0058 |

  About $2 per 1,000 answers on Gemini; the fallback costs 2–3× more. Reporting tags add
  $0.000075 per request, kept for spend by feature.

## D34. Concurrency {#concurrency}

- **Today:** Fluid compute in `cle1`; Cloud Run up to 3 instances × 80 requests per environment;
  one `db-f1-micro` with about 25 connections for both environments.
- **Finding:** 5 connections per instance would need 30 at full scale.
- **Choice:** a pool of 4 per instance (24 total), noted next to both settings.
- **Fit:** 80 advisors is a few requests a second at peak, well inside this. The database's
  connection limit is the real ceiling; beyond it, a larger instance or a connection pooler.

## D35. Rollout {#rollout}

- **Today:** a Preview Deployment per branch against staging (D12); `release/*` merged to
  `master` deploys the production API and web app (D32). Rollback: Instant Rollback on Vercel,
  the previous revision on Cloud Run. Expand-then-contract migrations; the API ships first when a
  change spans both.
- **For Meridian:** a pilot group validates each rebuilt screen; everyone switches once all are
  validated; the React app stays read-only for 30 days. After the switchover, Rolling Releases
  and Skew Protection.

## D36. Warm API {#warm-api}

- **Measured:** staging at zero instances took 6.8 s for the first vehicle page (about 3.8 s
  Cloud Run startup, the rest a cold function, token exchange and empty cache); production with
  one instance took 0.46 s.
- **Choice:** one minimum instance on production; staging scales to zero. About $10/month idle
  (estimate). Stays within D34's connection limit.
- **Options:** a scheduled `/health` ping.
- **Doesn't fix:** the Vercel side after a deploy (empty Runtime Cache, one token exchange per new
  instance).

## D37. Past telematics {#telematics-windows}

- **Finding:** related faults filtered the newest 50 events, so an older case's week came back
  empty.
- **Choice:** the API takes `from`/`to` (and `codedOnly`) on telematics; the case page reads one
  window per case. A window that ended over 24 hours ago is cached for days; newer ones read
  fresh. The 24 hours allows for late uploads from offline vehicles.
- **Options:** caching the live feed briefly; fetching only new events.
- **Production path:** the ingest pipeline invalidates `telematics:{vin}` when a late event lands.

## Renumbering {#renumbering}

On Nov 16, 2026 entries were renumbered 1–37; commits before then use the old numbers (D1–D3
unchanged): D6→4 · D11→5 · D14→6 · D16→7 · D17→8 · D18→9 · D19→10 · D21→11 · D22→12 · D23→13 ·
D24→14 · D25→15 · D26→16 · D28→17 · D29→18 · D30→19 · D31→20 · D32→21 · D33→22 · D34→23 ·
D35→24 · D36→25 · D37→26 · D38→27 · D39→28 · D40→29 · D41→30 · D42→31 · D43→32 · D45→33 ·
D46→34 · D47→35 · D48→36 · D49→37
