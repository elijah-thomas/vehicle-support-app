"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AgentChatView, type ChatViewMessage } from "@/components/assistant/agent-chat-view";
import { loadAgentChat, storeAgentChat } from "@/lib/assistant/agent-chat-history";
import { aiErrorCode } from "@/lib/assistant/ai-request-error";
import type { VehicleAgentMessage } from "@/lib/ai/vehicle-agent";
import type { Suggestion } from "@/lib/assistant/assistant-suggestions";

type Props = { vin: string | null; suggestions: Promise<Suggestion[]> | null };

const subscribeNever = () => () => {};

// Browser storage isn't readable during the server render, so the chat mounts again once
// hydrated, starting from this vehicle's thread (D18). Until then it shows the disabled state.
export function AgentChat(props: Props) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const vin = hydrated ? props.vin : null;
  return <AgentChatPanel key={vin ?? "pending"} vin={vin} suggestions={vin ? props.suggestions : null} />;
}

// The AI SDK version: useChat against /api/agent, with the thread kept in the tab (D18).
function AgentChatPanel({ vin, suggestions }: Props) {
  // Set when the route says the record is loaded and the model is working (app/api/agent/route.ts).
  const [answering, setAnswering] = useState(false);
  const [restored] = useState(() => (vin === null ? null : loadAgentChat(vin)));
  const { messages, setMessages, sendMessage, regenerate, status, error, stop } = useChat<VehicleAgentMessage>({
    messages: restored?.messages,
    transport: new DefaultChatTransport({ api: "/api/agent", body: { vin } }),
    onData: (part) => {
      if (part.type === "data-status") setAnswering(true);
    },
  });
  // A reload during an answer left it unfinished, so ask the question again once. The thread can
  // end in the question or in an empty or partial answer (the SDK adds the answer on the stream's
  // first chunk, before the save that marks it done); regenerate() drops that answer and re-asks.
  const reask = restored?.pending === true;
  const reasked = useRef(false);

  useEffect(() => {
    if (!reask || reasked.current) return;
    // Deferred so React's dev double-mount, which stops the chat on unmount, doesn't cancel it.
    const timer = setTimeout(() => {
      reasked.current = true;
      void regenerate();
    });
    return () => clearTimeout(timer);
  }, [reask, regenerate]);

  // Written when a question is sent and when its answer ends, not on every streamed token.
  useEffect(() => {
    if (vin === null || status === "streaming") return;
    storeAgentChat(vin, { messages, pending: status === "submitted" || (reask && !reasked.current) });
  }, [vin, messages, status, reask]);

  useEffect(() => {
    if (status === "submitted") return () => setAnswering(false);
  }, [status]);

  return (
    <AgentChatView
      vin={vin}
      suggestions={suggestions}
      messages={messages.map(toViewMessage)}
      busy={status === "submitted" || status === "streaming"}
      reading={status === "submitted" && !answering}
      answering={answering || status === "streaming"}
      settled={status === "ready"}
      error={error ? aiErrorCode(error) : null}
      onSend={(text) => sendMessage({ text })}
      onStop={() => stop()}
      onRetry={() => regenerate()}
      // Emptying the thread also removes its saved copy (lib/assistant/agent-chat-history.ts), so a
      // reload doesn't bring it back.
      onNewChat={() => {
        reasked.current = true;
        setMessages([]);
      }}
    />
  );
}

function toViewMessage(message: VehicleAgentMessage): ChatViewMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    texts: message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    tools: message.parts.flatMap((part) =>
      part.type.startsWith("tool-") ? [{ type: part.type, state: "state" in part ? part.state : undefined }] : [],
    ),
  };
}
