"use client";

import { activeTurn, runs, turns } from "eve/events";
import { useEveAgent, type EveMessage } from "eve/react";
import { useState, useSyncExternalStore } from "react";
import { AgentChatView, type ChatViewMessage } from "@/components/assistant/agent-chat-view";
import type { AiErrorCode } from "@/lib/assistant/ai-request-error";
import type { Suggestion } from "@/lib/assistant/assistant-suggestions";
import { loadEveSession, storeEveSession } from "@/lib/assistant/eve-chat-session";

type Props = { vin: string | null; suggestions: Promise<Suggestion[]> | null };

const subscribeNever = () => () => {};
const noop = () => {};

// The Eve version of the Ask tab (D28). Same panel as the AI SDK version; the conversation lives
// on the server, and the tab keeps only its ID.
export function EveChat(props: Props) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const vin = hydrated ? props.vin : null;
  if (vin === null) {
    return (
      <AgentChatView
        vin={null}
        suggestions={null}
        messages={[]}
        busy={false}
        reading={false}
        answering={false}
        settled={false}
        error={null}
        onSend={noop}
        onStop={noop}
        onRetry={noop}
        onNewChat={noop}
      />
    );
  }
  return <EveChatPanel key={vin} vin={vin} suggestions={props.suggestions} />;
}

function EveChatPanel({ vin, suggestions }: { vin: string; suggestions: Promise<Suggestion[]> | null }) {
  const [saved] = useState(() => loadEveSession(vin));
  const agent = useEveAgent({
    // The channel binds the conversation to this vehicle when it starts (agent/channels/eve.ts).
    headers: { "x-vehicle-vin": vin },
    initialSession: saved ? { sessionId: saved, streamIndex: 0 } : undefined,
    resume: saved !== null,
    onSessionChange: (session) => storeEveSession(vin, session?.sessionId ?? null),
  });

  const turn = activeTurn(agent.view);
  const modelStarted = turn ? runs(agent.view, { turnId: turn.turnId }).length > 0 : false;
  const lastQuestion = agent.messages.findLast((message) => message.role === "user");

  return (
    <AgentChatView
      vin={vin}
      suggestions={suggestions}
      messages={withoutRetriedFailures(agent.messages).map(toViewMessage)}
      busy={agent.status !== "idle" || turn !== undefined}
      reading={turn !== undefined && !modelStarted}
      answering={modelStarted}
      settled={agent.status === "idle" && turn === undefined}
      error={errorCode(agent)}
      // A failed send also lands in agent.error, which the panel shows.
      onSend={(text) => agent.send(text).catch(() => {})}
      onStop={() => agent.cancel().catch(() => {})}
      onRetry={() => {
        const text = lastQuestion ? textsOf(lastQuestion).join("") : "";
        if (text) agent.send(text).catch(() => {});
      }}
      onNewChat={() => {
        storeEveSession(vin, null);
        agent.newSession();
      }}
    />
  );
}

function errorCode(agent: ReturnType<typeof useEveAgent>): AiErrorCode | null {
  // The Firewall's rate limit (D23) answers before Eve does.
  if (agent.error) return "status" in agent.error && agent.error.status === 429 ? "rate_limited" : "failed";
  return turns(agent.view).at(-1)?.outcome === "failed" ? "failed" : null;
}

// A question whose send failed stays in the list, marked failed. Once Try again sends it again
// and Eve confirms it, the failed copy is left out so the question shows once.
function withoutRetriedFailures(messages: readonly EveMessage[]): EveMessage[] {
  const failed = (message: EveMessage) => message.metadata?.status === "failed";
  const confirmed = new Set(messages.filter((m) => m.role === "user" && !failed(m)).map((m) => textsOf(m).join("")));
  return messages.filter((message) => !(message.role === "user" && failed(message) && confirmed.has(textsOf(message).join(""))));
}

function textsOf(message: EveMessage): string[] {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
}

// Eve's tool states, in the AI SDK names the tool chip already shows.
const toolStates: Record<string, string> = {
  completed: "output-available",
  failed: "output-error",
  rejected: "output-error",
  cancelled: "output-error",
};

function toViewMessage(message: EveMessage): ChatViewMessage {
  return {
    id: message.id,
    role: message.role,
    texts: textsOf(message),
    tools: message.parts.flatMap((part) =>
      part.type === "tool" && !part.hidden ? [{ type: `tool-${part.name}`, state: toolStates[part.state] }] : [],
    ),
  };
}
