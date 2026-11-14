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
