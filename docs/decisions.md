# Decisions

The decisions behind this build, grouped by area. Each one says what we do, why, what we turned
down, what it costs, and what a production deployment would change.

When a later decision changes one, the entry is edited to match, and a **Changed** line says what
changed and when. Code marks where a decision lands with a `Decision (Dnn)` comment.

## Platform and boundary

<a id="screen-by-screen"></a>
### D1. Rebuild the console on Vercel one screen at a time

- **Decision:** Next.js on Vercel, screen by screen, starting with the vehicle workspace.
  Meridian's API and database stay on Google Cloud.
- **Why:** Each screen reaches advisors as soon as it's validated, and can be rolled back on its
  own. One workspace with an assistant replaces hopping between screens.
- **Instead of:** A full rebuild at once, where nothing ships until everything does. An assistant
  beside the old app, which leaves the screen-hopping. Next.js on Cloud Run, which Meridian
  weighed: it would own scaling, the CDN, previews and rollbacks.
- **Trade-off:** Functions run in one region, next to the data ([D4](#function-region)). Advisors
  abroad get a faster page shell, not faster data.

<a id="api-boundary"></a>
### D2. Meridian's API stays the only path to its data, unchanged for AI

- **Decision:** Express on Cloud Run with Cloud SQL Postgres. The API owns the schema, and Vercel
  never connects to the database. Endpoints follow the data, not the assistant: customer by
  email; vehicle by VIN; telematics; cases and notes, with create, close, reopen, and remove or
  restore a note. The web app checks every response against its own schemas.
- **Why:** Meridian's API shouldn't change to suit AI, so all AI logic stays on Vercel. In real
  life another team owns the API, so the web app treats it as an external contract.
- **Instead of:** Firestore, or an external Postgres such as Neon. A shared contracts package
  between the two apps.
- **Trade-off:** Response shapes are written twice, once on each side.

<a id="boundary-auth"></a>
### D3. Vercel calls the API with short-lived Google tokens, not a stored key

- **Decision:** Vercel's identity token (OIDC) is exchanged through Google's Workload Identity
  Federation for a Google token, which Cloud Run checks before a request reaches the API. Each
  function instance reuses its token for about an hour. GitHub Actions deploys the API the same
  way.
- **Why:** There's no secret to leak or rotate, access is scoped per Vercel project and
  environment ([D26](#environments)), and anonymous calls get a 403. It works end to end,
  including inside cached functions.
- **Instead of:** A shared API key, which is a long-lived secret.
- **Later:** If Meridian requires private APIs, Vercel Secure Compute (Enterprise) with a VPN to
  an internal load balancer.

<a id="function-region"></a>
### D4. Functions run in Cleveland, next to the API, and the API stays warm

- **Decision:** Vercel functions run in `cle1` (Cleveland), the closest region to the API in
  Iowa. They use Fluid compute, so one instance serves many requests while they wait on a model.
  One production API instance always stays running; staging scales to zero.
- **Why:** Every dynamic request calls the API. A cold first page took 6.8 s, 3.8 s of it the API
  starting up; with a warm instance it took 0.46 s.
- **Instead of:** A scheduled ping to keep the API awake.
- **Trade-off:** One region: if it fails, Vercel reroutes to the next closest. The warm instance
  costs about $10/month. Right after a deploy, the first requests are still slower, because
  Vercel's cache starts empty.

<a id="db-access"></a>
### D5. The API reaches Postgres through IAM, with a small connection pool

- **Decision:** The API logs in to Postgres with its Google identity, not a password, through the
  Cloud SQL connector. The database accepts no other network path. The API can't change the
  schema; migrations run as the deployer ([D26](#environments)). Each API instance holds 4
  connections, so 3 instances in each of 2 environments use 24 of the database's roughly 25.
- **Why:** No password exists to leak. At 5 connections per instance, full scale would need 30.
  Peak load from 80 advisors is a few requests a second, well within this.
- **Trade-off:** The connection limit is the ceiling. Beyond it: a larger database or a
  connection pooler. The one manual password use was the first production reseed
  ([D27](#releases)).
- **Later:** A private IP for the database.

## Pages and data

<a id="data-model"></a>
### D6. Eight tables, seeded with five customer stories

- **Decision:** `customers`, `vehicle_models` (specs), `vehicles` (keyed by VIN),
  `telematics_events`, `recalls`, `vehicle_recalls`, `cases` and `case_notes`. The seed holds five
  synthetic customers, each also an eval case: Dana Whitfield (a fault that keeps returning, a
  CRITICAL safety event and an unanswered buyback request), Marcus Bell (a symptom matching an
  open recall his notes never mention), Priya Raman (a healthy vehicle), Jordan Okafor (two
  vehicles) and Sam Torres (a fault that returned after its case closed, and a transcript hiding a
  buyback request). Case notes exist only where a story needs them.
- **Why:** Specs belong to the vehicle model, so they cache well. The VIN is what advisors already
  use. Recalls let the assistant connect a symptom to an open recall, its most useful link. The
  assistant reads the seeded notes, so they follow the same rules its answers must: first names
  only, no promises, no instructions to the assistant.

<a id="caching"></a>
### D7. Data is cached by how often it changes

- **Decision:** Every vehicle page shares one static shell, and each panel streams in on its own.
  A case page reads its case from the cached case list, which its fault history needs anyway.
  Cached data lives in Vercel's Runtime Cache:

  | Data | Cached for | Cleared by |
  |---|---|---|
  | Vehicle, specs, recalls | Hours | Expiry |
  | Cases and notes | Minutes | Every write |
  | Past telematics (more than 24 hours old) | Days | Expiry |
  | Live telematics, assistant answers, customer search | Not cached | — |

- **Why:** The Runtime Cache is shared by every function instance, so a save clears stale cases
  everywhere at once; an in-memory cache would not. The 24 hours allows for vehicles that upload
  late after being offline. Customer search runs in a Server Action, which also keeps emails out
  of URLs.
- **Instead of:** Prerendering the seeded vehicles, which would put owner details in static HTML.
  Caching the live telematics feed briefly.
- **Trade-off:** A change made in another Meridian system, such as a completed recall, can take
  an hour to show, or up to a day for a vehicle nobody opens. Owner details stay cached for up to
  a day.
- **Later:** Meridian's CRM and telematics pipeline send change events that clear a vehicle's
  cache.

<a id="vehicle-layout"></a>
### D8. One vehicle layout holds the header and the assistant

- **Decision:** The header (vehicle, customer, status row, recall banners) and the assistant sit
  in a layout shared by every page for that vehicle. Moving between the overview, a case and a new
  case swaps only the left column. Case URLs use the number advisors say aloud: `/cases/24117`.
  The header shows the vehicle as it was when the advisor opened it, until a save, Retry or
  reload. The breadcrumb trail lives in the layout's state, not the URL, so a shared link opens
  the case rather than someone's route to it.
- **Why:** The chat and an unsaved draft survive every move. Refreshing the header on every click
  would cost an API call and a token exchange each time, and it only goes stale if new telematics
  arrive mid-visit.
- **Instead of:** Refreshing the header on every navigation. Putting the status row inside each
  page.
- **Trade-off:** A fault that arrives mid-visit shows in the telematics panel but not the header
  until a reload. A case number that doesn't exist shows "not found" with a 200 status, because
  the page shell has already been sent.

<a id="error-states"></a>
### D9. A failure stays in its panel

- **Decision:** Each panel, and the header, catches its own failure and offers Retry. Lookup
  errors show inline. A failed assistant answer offers Try again.
- **Why:** If telematics is down, the advisor loses that panel, not the page.

<a id="lookup"></a>
### D10. Lookup suggestions never call the server

- **Decision:** Suggestions come from the browser only: recently opened vehicles (kept without
  emails), the seeded vehicles, and hints as the advisor types, such as counting a VIN's
  characters toward 17.
- **Why:** A server search by prefix would let anyone list customers on a public prototype.
- **Later:** A server search, once advisors sign in.

<a id="faults"></a>
### D11. Faults count as current for 30 days, and one rule links each fault to its case

- **Decision:** Telematics has no "cleared" flag, so a fault from the last 30 days counts as
  current. Units come from the end of each telematics message, such as "(miles)", because the API
  has no unit field. Meridian's data doesn't record which fault led to which case, so one rule
  matches them: a case's fault is the newest coded event in the 7 days before the case opened.
  Fault rows link to their case, case rows show their fault, and a fault code in an assistant
  answer finds its row when clicked.
- **Why:** One rule in one place, so every panel agrees. It isn't explained on screen, so the app
  reads as a tool for advisors.
- **Trade-off:** On the overview, matching uses only the 20 newest events, so an old case may show
  no fault code; the case page reads its own date range.
- **Later:** A "cleared" flag, a units field and a real case-to-fault link in Meridian's API.

## Cases and notes

<a id="case-page"></a>
### D12. The case page has every action needed to finish a call

- **Decision:** Cases have numbers advisors can read aloud (CS-24117). The case page shows status,
  the activity thread and the fault's history, and lets the advisor add a quick note, close the
  case with a resolution, or reopen it with a reason. Removing a note needs no confirmation: it
  disappears with an 8-second Undo, and stays in the database, hidden from every read, including
  the assistant's. The API gained these actions without changing its existing routes or removing
  anything from the schema.
- **Why:** The case number belongs to Meridian's system of record, so the old React screens show
  the same one. Removing a note is rare and reversible, so a confirmation dialog would slow every
  removal to guard against a rare mistake. Keeping existing routes means the React app keeps
  working. Case numbers use a Postgres identity column, which the API's existing database
  permissions already cover; a SERIAL column would need a new grant.
- **Instead of:** A number generated in the web app. Deleting notes outright, which leaves nothing
  for Undo or audit. An "overdue" rule: it was the support desk's policy, not Meridian data, and
  without advisor sign-in or escalation it changed nothing.
- **Trade-off:** Escalation, case owners and priority need advisor sign-in, so they wait.
- **Changed:** The first case page had an overdue banner and matched faults by date only. Both
  were replaced by the current design.

<a id="note-ownership"></a>
### D13. The API checks that a note belongs to the vehicle

- **Decision:** Every note write carries the vehicle's VIN, and the API refuses a case that
  belongs to another vehicle.
- **Why:** A crafted request could otherwise attach a note to another customer's case. A check in
  the API protects every client, not just this one.
- **Trade-off:** A newly required field breaks callers that don't send it yet, including the React
  app. The safe order is to accept the field as optional, have every caller send it, and only then
  require it.

<a id="saving-notes"></a>
### D14. Saving never loses an advisor's edits or writes a note twice

- **Decision:**
  - A failed save keeps every edit in the form and says what went wrong. A new case and its first
    note are written together, so a failed save leaves nothing half-done.
  - Each AI-drafted note gets an ID in the browser. The API stores it and refuses a second note
    with the same ID, so saving again after a lost response returns the note already saved.
  - An unsaved draft is kept in the browser tab, so a reload doesn't lose it.
- **Why:** A save can succeed in the database while its response is lost. The advisor sees an
  error, saves again, and used to get a duplicate note or a second case. Only the browser knows
  two requests are the same attempt, and a unique index in the database holds even when two
  requests race. Tab storage clears when the tab closes, which matters because transcripts carry
  names and phone numbers.
- **Instead of:** Stored responses keyed by an idempotency header, as Stripe does: it covers every
  write but needs a new table and an expiry policy. Matching duplicate content within a time
  window, which is a guess. Browser storage that outlives the tab, which leaves transcripts on
  shared machines.
- **Trade-off:** The first save wins, so edits made between a lost save and its retry are dropped.
  A refused duplicate can skip a case number. Only call summaries are covered.
- **Later:** Server-side drafts once advisors sign in, and an idempotency key on every API write.

## The AI features

<a id="models"></a>
### D15. Claude answers first, Gemini is the fallback

- **Decision:** The assistant and call summaries use Claude Sonnet 5.5 on Anthropic first, and
  Gemini 3.8 Flash on Google's Vertex AI if Claude fails. Both run on Meridian's own provider
  keys, through Vercel's AI Gateway.
- **Why:** Advisors on a live call notice waiting more than anything else. In side-by-side tests,
  Claude's first word arrived in 0.9 s at the median and 1.2 s at worst; Gemini's took 2.7 s at
  the median and 36.5 s at worst. Both models passed every eval. Two vendors on two clouds still
  leave a working path if one fails.
- **Instead of:** Gemini first with a switch to Claude after 8 s: cheaper, but it still means
  waits of up to about 9 s and a retry path in both routes. Claude Haiku: a tenth of the cost, but
  it thinks before answering, so its first word took 3–7 s. Claude on Vertex AI: it would share
  Gemini's failures.
- **Trade-off:** About three times the model cost, billed to Meridian's Anthropic account instead
  of its Google Cloud commitment. Customer data now leaves Google Cloud on every request. AI
  Gateway switches models on errors, not on slow answers.
- **Later:** Revisit with pilot data: real waits, question volume and Meridian's negotiated
  prices.
- **Changed:** Nov 17, 2026. Gemini was first and Claude the fallback until Gemini's waits proved
  unpredictable.

<a id="agent"></a>
### D16. The assistant reads only the open vehicle, from a record loaded up front

- **Decision:** The assistant's route, not the model, picks the vehicle. Before the model runs,
  the route loads the vehicle, its cases and its 20 newest telematics events from the page's
  cache, and gives them to the model already shaped: dates formatted, repeat counts and case ages
  computed, internal IDs removed. Case numbers stay, because advisors say them aloud. One tool fetches older telematics, with at most 3 steps. The
  route accepts only what the chat sends: text questions up to 2,000 characters and the last 10
  messages.
- **Why:** No prompt can make the assistant read another customer's vehicle. The models had
  called every lookup tool on every question anyway; loading the record up front cut the median
  answer time from 4.7 s to 2.6 s on Gemini and from 5.4 s to 4.0 s on Claude. Facts computed in
  code are facts the model can't get wrong.
- **Instead of:** Forcing the model to call its tools first, which Anthropic doesn't allow with
  extended thinking. Vercel Workflows: each request finishes in seconds within one request,
  changes nothing until the advisor saves, and is cheap to retry, so no step is worth
  checkpointing.
- **Trade-off:** The assistant can't compare a customer's vehicles. Every request carries the
  record. There's no cap on answer length, because Gemini's hidden reasoning counted toward it and
  cut answers off. A caller can forge earlier turns of their own conversation, but nothing else.

<a id="answer-shape"></a>
### D17. Answers fit the question, and next steps appear only when they're new

- **Decision:** The route tells the model which next steps earlier answers already gave, and the
  model leaves them out; when none are new, it gives none. The safety step comes first whenever a
  CRITICAL event affects driving. "What should I tell the customer?" gets lines to read aloud,
  ending with what not to promise. A request for an email gets just the body.
- **Why:** In a multi-turn call about Dana, all three answers ended with the same next steps.
  Asking the model to check the conversation itself made Gemini stop and think before most
  answers, and its median wait rose from 1.8 s to 10.2 s. Computing the list in code kept the old
  speed.
- **Instead of:** New answer formats with their own styling, which means more to parse, render and
  test. Hiding repeats in the panel, which leaves the answers wrong.
- **Trade-off:** Sending email and templates are out of scope; they reach into Meridian's systems.
- **Changed:** Nov 17, 2026. Every answer used to end with next steps.

<a id="chat-reload"></a>
### D18. The chat survives a reload

- **Decision:** Each vehicle's conversation is saved in the browser tab as questions are asked and
  answered. After a reload it comes back; an answer cut off mid-stream is asked again once. A New
  chat button clears it.
- **Why:** Reviewer feedback: a refresh lost the conversation. Tab storage fixes that with no new
  service, and it clears when the tab closes, since the thread holds customer details.
- **Instead of:** Saving threads on the server, which survives a crash or a new device but needs
  advisor sign-in, a new store and customer details kept on the server. Moving the default
  assistant to Vercel's Eve agent framework, which keeps each conversation on the server: Vercel
  recommends an AI SDK agent like ours for a single AI feature in an existing app whose work
  finishes within one request
  ([guide](https://vercel.com/kb/guide/eve-vs-ai-sdk-agents-vs-workflowagent)).
- **Trade-off:** A second tab or a crashed browser starts empty.
- **Later:** Server-side threads per advisor, once advisors sign in.
- **Changed:** Nov 18, 2026. Eve was turned down outright. A test on a Preview showed it works,
  so an Eve version now runs behind a switch ([D28](#eve-assistant)); this one stays the default.

<a id="assistant-suggestions"></a>
### D19. Suggested questions come from fixed rules, not a model

- **Decision:** The Ask tab suggests up to five questions written for the vehicle in view: about
  its current fault, its open cases, its first open recall, what to tell the customer, and either
  a status summary or what changed since the last contact.
- **Why:** Rules cost nothing, are ready as soon as the record is, and make no extra API calls. If
  anything fails, three general questions appear instead.
- **Instead of:** Loading suggestions from the browser after the page, which adds an API call and
  a loading flash.
- **Trade-off:** Like the header, suggestions reflect the vehicle as first opened
  ([D8](#vehicle-layout)).

<a id="call-summary"></a>
### D20. One model call drafts the call note; the advisor edits and saves it

- **Decision:** The advisor pastes a transcript (up to 15,000 characters). One model call, given
  the transcript and the vehicle record, drafts the note: issue, summary and next steps, plus a
  subject and category for a new case. The advisor edits it and saves to an open case or a new
  one; the default is the open case in view, then the newest open case. A transcript with nothing
  to summarize, such as a wrong number, gets a warning instead of a made-up summary.
- **Why:** One call is predictable, cheap and easy to test. It has no tools, so instructions
  hidden in a transcript can't fetch or change anything. Closed cases aren't offered, because a
  note on a closed case is never followed up; reopening takes one click on the case page.
- **Instead of:** The assistant with its tools. Always opening a new case. Showing the draft
  without saving it.
- **Trade-off:** The draft sees only the record it's given. Transcripts are personal data sent to
  the model provider.
- **Later:** Zero Data Retention routing and a privacy review.
- **Changed:** Nov 17, 2026. Two prompt rules were reworded when Claude became first: hidden
  instructions are left out without being mentioned, and the customer's first name replaces every
  pronoun.

<a id="tests-and-evals"></a>
### D21. Tests check the code; evals check the models

- **Decision:** API tests run against a real Postgres, and about 100 unit tests cover the web app;
  both run in CI on every pull request. Evals run the real assistant and call summary against
  staging, on each model alone, three times per case: 13 assistant cases and 7 call-summary cases,
  including a request for another customer's vehicle and a prompt injection. Grading is by fixed
  rules: required facts present; invented codes, internal IDs, guessed pronouns and promises
  absent.
- **Why:** The evals caught Claude guessing pronouns, Gemini leaving out driver-safety advice and
  offering a loaner, Claude copying an injected instruction into a note, and a tool loop that
  added nothing. Latest results: every case passed on both models.
- **Instead of:** A model grading the answers. Mocked database tests.
- **Later:** Run the evals on every release.
- **Changed:** Nov 18, 2026. The assistant cases also run against the Eve version
  ([D28](#eve-assistant)), through its own API, so both versions are graded the same way.

<a id="cost-per-answer"></a>
### D22. Cost per answer comes from AI Gateway

- **Decision:** Each response's list-price cost comes from AI Gateway and is logged per answer,
  tagged by feature.
- **Why:** No price table to keep current. At list price, a Claude answer costs about half a
  cent, or about 1.2 cents deep in a conversation; Gemini costs less than half as much.
- **Trade-off:** It's the list price; Meridian's real bill is its negotiated rate.

<a id="eve-assistant"></a>
### D28. An Eve version of the assistant, behind a switch in the panel

- **Decision:** A second version of the assistant runs on Eve, Vercel's agent framework, with the
  same prompt, record, tool, models and evals. A switch in the Ask tab picks the version; the
  current one stays the default. The vehicle is fixed when an Eve conversation starts, so
  [D16](#agent)'s guarantee holds, and Eve's built-in bash, file and web tools are off. Hooks in
  the agent apply D16's limits: questions up to 2,000 characters, 3 model calls per answer, and
  about 30 answers per conversation. The tab keeps only the conversation's ID; after a reload, Eve
  replays the conversation from the server. A conversation closes when the advisor starts a new
  chat, or after 24 hours without a question.
- **Why:** Vercel recommends an agent like the current one for this case, and Eve for longer,
  durable work. Running both on the same questions shows the difference instead of arguing it. A
  test on a Preview passed: the vehicle couldn't be changed, functions ran in `cle1`
  ([D4](#function-region)), and the median first word took 1.37 s, against 1.46 s today. The Eve
  version passes every assistant eval ([D21](#tests-and-evals)).
- **Instead of:** A server-side flag only, which suits a pilot but can't be compared live. Not
  building it.
- **Trade-off:** Two versions to keep in step. Eve runs outside Next.js, so it reads the API on
  every turn instead of the page's cache ([D7](#caching)). Conversations are kept on Vercel, so
  customer details stay on the server. Eve reports tokens, not list price, so its cost per answer
  comes from AI Gateway's `feature:agent-eve` tag ([D22](#cost-per-answer)).
- **Later:** A server-side flag for the pilot group ([D27](#releases)). Eve as the only version
  once advisors sign in and the assistant takes actions that need approval.
- **Changed:** Nov 18, 2026. Conversations stayed open for Eve's default of 30 days, and New chat
  and the evals left theirs open, so 104 piled up in a day. The tab that holds a conversation's ID
  is gone well before 30 days, and 24 hours still covers a customer calling back the next day.

## Protection and spend

<a id="rate-limits"></a>
### D23. Rate limits: people at the edge, systems at the API

- **Decision:** Vercel Firewall allows each IP address 20 AI requests and 30 note saves a minute.
  Separately, the API allows each calling service 1,200 requests a minute.
- **Why:** A request blocked at the edge never starts a function or calls a model. The API's limit
  used to count by IP, but every request arrives from Vercel's shared addresses, so all advisors
  shared one small budget.
- **Instead of:** Rate limiting in code, or with Redis, which still starts a function per request.
- **Trade-off:** Advisors in one office share an IP, so per-IP limits don't suit production. The
  API counts in each instance's memory, so its real ceiling can be up to three times higher; fine
  for a backstop.
- **Later:** Per-advisor limits, once advisors sign in.
- **Changed:** Nov 18, 2026. The AI limit also covers the Eve version's questions
  ([D28](#eve-assistant)), which reach Eve's own routes instead of `/api/agent`.

<a id="spend-alerts"></a>
### D24. Spend alerts on Google Cloud, a hard cap on Anthropic

- **Decision:** A $25/month budget alert on Gemini spend in Google Cloud, and a $25/month hard
  limit on Anthropic.
- **Why:** The alert counts spend before credits; otherwise it would read $0 and never fire.
- **Instead of:** A budget that switches off Google Cloud billing, which would stop every service
  in the project. A lower Vertex AI quota.
- **Trade-off:** Google Cloud budgets alert but don't stop spending, and they lag by hours.
- **Later:** Per-model quotas and alerts to an on-call team.

## Delivery

<a id="terraform"></a>
### D25. Terraform defines Google Cloud, with three exceptions

- **Decision:** All Google Cloud resources are Terraform code in `infra/`, except the running API
  image (deployed by CI), Postgres permissions (a SQL file) and the Vercel project, whose Terraform
  provider needs a long-lived token. Firewall rules are JSON files applied with the Vercel CLI.
- **Why:** The boundary between Vercel and Google Cloud is what reviewers question, so it should
  be readable code.

<a id="environments"></a>
### D26. Staging and production are separate; CI migrates the database before deploying

- **Decision:** Staging and production each have their own API service, database and service
  accounts. `develop` deploys staging and `master` deploys production. Vercel previews use
  staging. On each push, GitHub Actions builds the API, migrates the database, then deploys.
- **Why:** A preview can never touch production data: Google checks which Vercel environment is
  calling. Migrating first means a failed migration leaves the running API untouched.
- **Instead of:** Running migrations as a separate Cloud Run job, or Terraform in CI.
- **Trade-off:** Every migration must work with the API version already running. A breaking
  change goes in steps: add the new shape, move callers over, then remove the old.

<a id="releases"></a>
### D27. Releases are named by date and roll back in one step

- **Decision:** Releases are named by date (`v26.11.15.1`) and reach production by merging a
  release branch to `master`. Rollback is one click on Vercel and the previous revision on Cloud
  Run. Meridian's screen-by-screen migration is the rollout plan in the proposal.
- **Why:** A date tells support which build is live.
- **Trade-off:** Production was reseeded once by hand with a temporary password, rotated
  afterwards.

---

<details>
<summary>Old decision numbers</summary>

Before Nov 18, 2026 this file had 49 entries, numbered in the order they were made. Older commits
cite those numbers.

| New | Old |
|---|---|
| D1 | D1, D28 |
| D2 | D2, D7, D8 |
| D3 | D3 |
| D4 | D4, D11, D36 |
| D5 | D10, D34 |
| D6 | D6, D38 |
| D7 | D14, D37 |
| D8 | D41, D43 |
| D9 | D29 |
| D10 | D21 |
| D11 | D17, D42 |
| D12 | D31, D40, D44 |
| D13 | D25 |
| D14 | D22, D46 |
| D15 | D5, D49 |
| D16 | D15, D27, D30 |
| D17 | D47 |
| D18 | D48 |
| D19 | D39 |
| D20 | D16, D26, D45 |
| D21 | D19, D24 |
| D22 | D33 |
| D23 | D18, D20 |
| D24 | D23 |
| D25 | D9 |
| D26 | D12, D13 |
| D27 | D32, D35 |

</details>
