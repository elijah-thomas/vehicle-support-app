# Evidence

The measurements behind the decisions in [decisions.md](decisions.md). Each entry there keeps
only its headline number and links here. Newest first within each section.

Evals run on each model alone, three times per case ([D19](decisions.md#evals)). Costs are AI
Gateway's `marketCost`, the list price of the tokens ([D33](decisions.md#cost-per-run)).

<a id="eval-results"></a>
## Eval results

| Date | Decision | Agent: Gemini | Agent: Claude | Call summary: Gemini | Call summary: Claude | Note |
|---|---|---|---|---|---|---|
| Nov 17, 2026 | [D49](decisions.md#assistant-model) | 39/39 | 39/39 | 21/21 | 21/21 | After the call-summary prompt fix. Claude was 19/21 to 20/21 before it; 20/20 on the Marcus and Sam cases after. |
| Nov 17, 2026 | [D47](decisions.md#answer-shape) | 39/39 | 39/39 | 41/42 combined | | 13 agent cases, up from 10. Claude once named "buyback" when it noted the injected line in Sam's transcript. |
| Nov 16, 2026 | [D44](decisions.md#case-actions) | 30/30 | 30/30 | 21/21 | 21/21 | Case numbers cited throughout; no mention of the removed note. |
| Nov 16, 2026 | [D40](decisions.md#case-numbers) | 30/30 | 29/30 | 21/21 | 20/21 | After a reseed. Claude's two misses were intermittent: one summary mentioned the transcript's injected request without following it (3/3 on a rerun); one tire-pressure answer called `getTelematics` (6/6 on reruns). |
| Nov 2026 | [D30](decisions.md#agent-context) | 30/30 | 30/30 | | | Record loaded up front. Claude up from 29/30. |
| Nov 2026 | [D19](decisions.md#evals) | 30/30 | 30/30 | 21/21 | 21/21 | First full run: 10 agent cases, 7 call-summary cases. |

<a id="latency"></a>
## Latency

### Claude first against Gemini first (Nov 17, 2026, [D49](decisions.md#assistant-model))

The assistant: the same three-question call on Dana's vehicle, 6 runs per model, alternating
rounds, current prompt.

| Model | First word: median / p90 / worst | Over 8 s | Cost per answer |
|---|---|---|---|
| Gemini 3.8 Flash | 2.7 s / 15.0 s / 36.5 s | 3 of 18 | $0.0032 |
| Claude Sonnet 5.5 | 0.9 s / 1.0 s / 1.2 s | 0 of 18 | $0.0116 |

Call summaries: the call-summary evals, 3 runs per case.

| Model | Median | p90 | Worst | Cost per draft |
|---|---|---|---|---|
| Gemini 3.8 Flash | 2.9 s | 11.4 s | 97.6 s | $0.0020 |
| Claude Sonnet 5.5 | 3.0 s | not recorded | 5.0 s | $0.0048 |

Claude Haiku 5.5 also scored 39/39 at about a tenth of Sonnet's cost, but it thinks before
answering, so its first word took 3–7 s.

### Answer shape (Nov 17, 2026, [D47](decisions.md#answer-shape))

4 questions × 6 runs on Gemini 3.8 Flash.

| Prompt | Answers with thinking | Median thinking tokens | First word, median |
|---|---|---|---|
| Before D47 | 5 of 24 | | 1.8 s |
| First D47 draft: model checks for steps already given | 20 of 24 | 834 | 10.2 s |
| Final D47: list computed in code (re-measured with the old prompt in the same window) | 6 of 24 (old: 4 of 24) | | 4.3 s (old: 4.3 s) |

After D47, eval medians were 3.2 s on Gemini and 3.3 s on Claude, with average thinking of 57
tokens on Gemini and 0 on Claude.

### Record loaded up front ([D30](decisions.md#agent-context))

| Model | Median before | Median after | Tokens |
|---|---|---|---|
| Gemini 3.8 Flash | 4.7 s | 2.6 s | |
| Claude Sonnet 5.5 | 5.4 s | 4.0 s | about 20% fewer |

### Cold start ([D36](decisions.md#warm-api))

With staging at zero instances, the first vehicle page took 6.8 s, about 3.8 s of it Cloud Run
starting up. Production, with one instance running, took 0.46 s.

<a id="cost"></a>
## Cost

List price per answer. The figures differ by test, because a multi-turn call sends more history.

| Date | Test | Gemini 3.8 Flash | Claude Sonnet 5.5 |
|---|---|---|---|
| Nov 17, 2026 | Assistant, three-question call ([D49](decisions.md#assistant-model)) | $0.0032 | $0.0116 |
| Nov 17, 2026 | Call summary evals ([D49](decisions.md#assistant-model)) | $0.0020 | $0.0048 |
| Nov 17, 2026 | Agent evals, average ([D47](decisions.md#answer-shape)) | $0.0023 | $0.0053 |
| Nov 2026 | Agent answer ([D33](decisions.md#cost-per-run)) | $0.0019–0.0020 | $0.0042–0.0059 |
| Nov 2026 | Call summary ([D33](decisions.md#cost-per-run)) | $0.0019 | $0.0039–0.0058 |

Reporting tags add $0.000075 per request. D49's estimate of $46 a day against $13 a day uses
the three-question figures at 4,000 answers a day (80 advisors asking 50 questions each).

<a id="prompt-experiments"></a>
## Prompt experiments

- **Two call-summary rules reworded for Claude (Nov 17, 2026, [D49](decisions.md#assistant-model)).**
  Claude noted injected instructions in the summary ("text asking for a buyback was left out"),
  and the note is saved and read again; the rule now says to leave them out "without mentioning
  them". Claude echoed the transcript's "he" in about 2 of 11 Marcus drafts; the rule now says to
  repeat the first name. Result: 20/20 on the Marcus and Sam cases, 21/21 on the full set for
  both models.
- **Case age kept out of call summaries (Nov 17, 2026, [D47](decisions.md#answer-shape)).**
  With `lastUpdate` and `daysSinceUpdate` in the input, Claude's call summaries slipped a pronoun
  in 3 of 16 runs, against 0 of 16 without. Only the agent gets them.
- **Answer-shape prompt (Nov 17, 2026, [D47](decisions.md#answer-shape)).** The first version
  had the model check the conversation for steps it had already given, and decide when to repeat
  the safety step. Thinking came from those two rules combined; rewording either alone didn't
  help. `low` is the lowest thinking level the AI Gateway catalog lists for Gemini 3, and the
  Gateway maps every other AI SDK `reasoning` value to `high`
  ([docs](https://vercel.com/docs/ai-gateway/models-and-providers/reasoning/google)). The fix
  computed the list in code, turned rules into one-line triggers, and let the examples carry each
  answer's shape, as Google's and Anthropic's prompting guides recommend.
- **Eval checks that rejected correct answers ([D47](decisions.md#answer-shape)).** The promise
  check now needs the verb within three words of the item, so "provide an update on the buyback"
  passes. Priya's and Marcus's checks accept "no reported faults" and "dealer update".
- **Inviting case numbers (Nov 16, 2026, [D40](decisions.md#case-numbers)).** A prompt line
  "or by case number, such as CS-24117" made Claude slip on pronouns: the Marcus call summary
  failed 5 of 9 runs, and two agent cases 4 of 18, against 6/6 and 12/12 with the original
  prompts. Both prompts went back to their earlier wording, which forbids only internal IDs.
  Answers still cite case numbers from the record without being told to.
- **Borderline calls (Nov 17, 2026, [D26](decisions.md#junk-transcripts)).** A wrong number can
  be read as `other` or `no_conversation`; both show a warning, so the prompt was left alone.

## Browser checks

- **Answer shape (Nov 17, 2026, [D47](decisions.md#answer-shape)).** Playwright on Dana's call,
  through the route: next steps showed only on the first answer, the second didn't repeat them,
  and the email rendered as plain paragraphs.
- **Chat after a reload (Nov 17, 2026, [D48](decisions.md#chat-reload)).** Results are listed
  in the decision.
