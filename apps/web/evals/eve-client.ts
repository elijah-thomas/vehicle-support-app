// Drives the Eve version of the assistant (D28) over its HTTP API, as the browser does: one
// conversation per case, bound to the case's vehicle by the header, one turn per question.
// See docs/decisions.md#eve-assistant

export type EveAnswer = { text: string; tools: string[]; seconds: number; steps: number; tokens: number };

type Fact = { type: string; data?: Record<string, unknown> };

export async function askEve(baseUrl: string, vin: string, questions: string[]): Promise<EveAnswer> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-vehicle-vin": vin };
  // A Preview behind Deployment Protection needs its automation bypass secret.
  if (process.env.EVAL_BYPASS) headers["x-vercel-protection-bypass"] = process.env.EVAL_BYPASS;

  let sessionId: string | undefined;
  let answer: EveAnswer | undefined;
  for (const [index, question] of questions.entries()) {
    const started = performance.now();
    const url = sessionId ? `${baseUrl}/eve/v1/session/${sessionId}` : `${baseUrl}/eve/v1/session`;
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ message: question }) });
    if (!response.ok) throw new Error(`Eve refused the question (${response.status}): ${await response.text()}`);
    sessionId ??= ((await response.json()) as { sessionId: string }).sessionId;
    answer = await readTurn(`${baseUrl}/eve/v1/session/${sessionId}/stream`, headers, index, started);
  }
  if (!answer) throw new Error("No questions to ask");
  return answer;
}

// The stream replays the conversation from the start, so skip the turns before this one.
async function readTurn(url: string, headers: Record<string, string>, turnIndex: number, started: number): Promise<EveAnswer> {
  const response = await fetch(url, { headers });
  if (!response.ok || !response.body) throw new Error(`Eve stream failed (${response.status})`);
  const decoder = new TextDecoder();
  let buffer = "";
  let settled = 0;
  const answer: EveAnswer = { text: "", tools: [], seconds: 0, steps: 0, tokens: 0 };

  const reader = response.body.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    buffer += decoder.decode(read.value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const parsed = JSON.parse(line) as { facts?: Fact[]; progress?: Fact };
      for (const fact of parsed.facts ?? (parsed.progress ? [parsed.progress] : [])) {
        if (settled === turnIndex) {
          if (fact.type === "content.delta") answer.text += String(fact.data?.delta ?? "");
          if (fact.type === "call.requested") answer.tools.push(String((fact.data?.capability as { name?: string })?.name));
          if (fact.type === "model.requested") answer.steps++;
          if (fact.type === "usage.recorded") {
            const usage = fact.data?.usage as { inputTokens?: number; outputTokens?: number } | undefined;
            answer.tokens += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
          }
        }
        if (fact.type !== "turn.settled") continue;
        if (settled++ < turnIndex) continue;
        if (fact.data?.outcome !== "completed") {
          await reader.cancel();
          throw new Error(`Eve turn ${String(fact.data?.outcome)}: ${JSON.stringify(fact.data?.error)}`);
        }
        answer.seconds = (performance.now() - started) / 1000;
        await reader.cancel();
        return answer;
      }
    }
  }
  throw new Error("Eve stream ended before the answer settled");
}
