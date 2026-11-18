"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Car, CircleAlert, FileText, MessageSquare, RotateCcw, ShieldAlert, Square, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Suspense, use, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AgentAnswer } from "@/components/agent-answer";
import { AgentToolStep } from "@/components/agent-tool-step";
import { TypingIndicator } from "@/components/typing-indicator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAgentChat, storeAgentChat } from "@/lib/agent-chat-history";
import { aiErrorCode } from "@/lib/ai-request-error";
import type { VehicleAgentMessage } from "@/lib/ai/vehicle-agent";
import type { Suggestion, SuggestionKind } from "@/lib/assistant-suggestions";

const suggestionIcons: Record<SuggestionKind, { Icon: LucideIcon; className: string }> = {
  critical: { Icon: TriangleAlert, className: "text-destructive" },
  warning: { Icon: TriangleAlert, className: "text-warning" },
  case: { Icon: FileText, className: "text-info" },
  recall: { Icon: ShieldAlert, className: "text-warning" },
  customer: { Icon: MessageSquare, className: "text-muted-foreground" },
  summary: { Icon: Car, className: "text-muted-foreground" },
};

const MAX_TEXT_LENGTH = 2000;
const MAX_FOLLOW_UPS = 2;

function errorCopy(error: Error) {
  switch (aiErrorCode(error)) {
    case "rate_limited":
      return { tone: "warning", text: "Too many questions. Wait a minute, then ask again.", retry: false } as const;
    case "too_long":
      return { tone: "warning", text: `Keep questions under ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters.`, retry: false } as const;
    default:
      return {
        tone: "destructive",
        text: "The assistant couldn't answer. The vehicle record is still on this page.",
        retry: true,
      } as const;
  }
}

function PromptButton({ prompt, onAsk, disabled }: { prompt: string; onAsk: (prompt: string) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onAsk(prompt)}
      disabled={disabled}
      className="h-7 rounded-md border border-input bg-card px-2 text-left text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
    >
      {prompt}
    </button>
  );
}

function SuggestionText({ suggestion }: { suggestion: Suggestion }) {
  if (!suggestion.code) return suggestion.text;
  const [before, after] = suggestion.text.split(suggestion.code);
  return (
    <>
      {before}
      <span className="font-mono">{suggestion.code}</span>
      {after}
    </>
  );
}

function SuggestionList({
  suggestions,
  onAsk,
  disabled,
}: {
  suggestions: Promise<Suggestion[]>;
  onAsk: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-md border">
      {use(suggestions).map((suggestion) => {
        const { Icon, className } = suggestionIcons[suggestion.kind];
        return (
          <li key={suggestion.text}>
            <button
              type="button"
              onClick={() => onAsk(suggestion.text)}
              disabled={disabled}
              className="flex min-h-10 w-full items-center gap-2.5 bg-card px-3 py-2 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
              <span>
                <SuggestionText suggestion={suggestion} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SuggestionListSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-md border" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex min-h-10 items-center gap-2.5 px-3 py-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      ))}
    </div>
  );
}

function FollowUps({
  suggestions,
  asked,
  onAsk,
}: {
  suggestions: Promise<Suggestion[]>;
  asked: Set<string>;
  onAsk: (prompt: string) => void;
}) {
  const followUps = use(suggestions)
    .map((suggestion) => suggestion.text)
    .filter((text) => !asked.has(text))
    .slice(0, MAX_FOLLOW_UPS);
  if (followUps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Follow-up questions">
      {followUps.map((prompt) => (
        <PromptButton key={prompt} prompt={prompt} onAsk={onAsk} />
      ))}
    </div>
  );
}

// vin and suggestions are null while the page's params resolve: the same empty state renders
// disabled, so it can be the Suspense fallback and prerender in the static shell.
// See docs/decisions.md#vehicle-page-caching
type Props = { vin: string | null; suggestions: Promise<Suggestion[]> | null };

const subscribeNever = () => () => {};

// Browser storage isn't readable during the server render, so the chat mounts again once
// hydrated, starting from this vehicle's thread (D48). Until then it shows the disabled state.
export function AgentChat(props: Props) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const vin = hydrated ? props.vin : null;
  return <AgentChatPanel key={vin ?? "pending"} vin={vin} suggestions={vin ? props.suggestions : null} />;
}

function AgentChatPanel({ vin, suggestions }: Props) {
  const loading = vin === null;
  const [input, setInput] = useState("");
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
  // A reload during an answer left the question unanswered, so ask it again once.
  const reask = restored?.pending === true && restored.messages.at(-1)?.role === "user";
  const reasked = useRef(false);
  const busy = status === "submitted" || status === "streaming";
  const started = messages.length > 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The question box moves from the top to the bottom on the first question, and back on New chat,
  // which remounts it. Focus follows only if it was already in the chat; on page load the lookup
  // owns focus (`/`).
  const refocus = useRef(false);

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
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status, answering]);

  useEffect(() => {
    if (status === "submitted") return () => setAnswering(false);
  }, [status]);

  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [started]);

  // Starts a new conversation, such as for a new call. Emptying the thread also removes its saved
  // copy (lib/agent-chat-history.ts), so a reload doesn't bring it back.
  function clearChat() {
    reasked.current = true;
    setMessages([]);
    setInput("");
    refocus.current = true;
  }

  function ask(text: string) {
    if (!text.trim() || busy || loading) return;
    if (!started) refocus.current = rootRef.current?.contains(document.activeElement) ?? false;
    sendMessage({ text });
    setInput("");
  }

  const failure = error ? errorCopy(error) : null;
  const asked = new Set(
    messages.flatMap((m) => (m.role === "user" ? m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])) : [])),
  );
  const showFollowUps = status === "ready" && messages.at(-1)?.role === "assistant";
  // The record is read and the model is working, but no words have arrived. The bubble goes in the
  // answer once the stream has opened one, and on its own before that, so "Assistant" shows once.
  const last = messages.at(-1);
  const answerStarted = last?.role === "assistant";
  const waitingForWords =
    busy &&
    (answering || status === "streaming") &&
    !(answerStarted && last.parts.some((part) => part.type === "text" && part.text.trim()));

  const questionBox = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask(input);
      }}
      className={cn("space-y-1.5", started && "border-t bg-card p-3")}
    >
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={started ? "Ask a follow-up" : "Ask about this vehicle"}
          aria-label={started ? "Ask a follow-up" : "Ask about this vehicle"}
          maxLength={MAX_TEXT_LENGTH}
          disabled={loading}
          aria-describedby="agent-scope"
        />
        {busy ? (
          <Button type="button" variant="outline" size="icon" onClick={() => stop()} aria-label="Stop answering">
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Ask">
            <ArrowUp />
          </Button>
        )}
      </div>
      {/* The assistant gets only this vehicle's record (D30), so the rep knows not to ask about
          other vehicles or policy. */}
      <div className="flex items-center justify-between gap-2">
        <p id="agent-scope" className="text-xs text-muted-foreground">
          Answers use only this vehicle&apos;s record, telematics and case history.
        </p>
        {started && (
          <Button type="button" variant="ghost" size="xs" onClick={clearChat} disabled={busy} className="shrink-0 text-muted-foreground">
            <RotateCcw aria-hidden />
            New chat
          </Button>
        )}
      </div>
    </form>
  );

  if (!started) {
    return (
      <div ref={rootRef} className="space-y-4 p-4">
        {questionBox}
        <section aria-labelledby="agent-suggestions" className="space-y-2">
          <h3 id="agent-suggestions" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Suggested for this vehicle
          </h3>
          {suggestions ? (
            <Suspense fallback={<SuggestionListSkeleton />}>
              <SuggestionList suggestions={suggestions} onAsk={ask} disabled={loading} />
            </Suspense>
          ) : (
            <SuggestionListSkeleton />
          )}
        </section>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="contents">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        className="max-h-[60vh] min-h-40 flex-1 space-y-5 overflow-y-auto p-4 lg:max-h-none"
      >
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex flex-col items-end gap-1">
              <span className="text-xs font-semibold text-muted-foreground">You</span>
              {message.parts.map((part, i) =>
                part.type === "text" ? (
                  <p key={i} className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                    {part.text}
                  </p>
                ) : null,
              )}
            </div>
          ) : (
            <div key={message.id} className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Assistant</span>
              {message.parts.some((part) => part.type.startsWith("tool-")) && (
                <div className="flex flex-wrap gap-1.5" aria-label="Sources checked">
                  {message.parts.map((part, i) =>
                    part.type.startsWith("tool-") ? (
                      <AgentToolStep key={i} type={part.type} state={"state" in part ? part.state : undefined} />
                    ) : null,
                  )}
                </div>
              )}
              {vin && message.parts.map((part, i) => (part.type === "text" ? <AgentAnswer key={i} vin={vin} text={part.text} /> : null))}
              {message === last && waitingForWords && <TypingIndicator />}
              {message === messages.at(-1) && showFollowUps && suggestions && (
                <Suspense fallback={null}>
                  <FollowUps suggestions={suggestions} asked={asked} onAsk={ask} />
                </Suspense>
              )}
            </div>
          ),
        )}

        {status === "submitted" && !answering && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden />
            Reading the record…
          </p>
        )}

        {waitingForWords && !answerStarted && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Assistant</span>
            <TypingIndicator />
          </div>
        )}

        {failure && (
          <Alert variant={failure.tone}>
            {failure.tone === "warning" ? <TriangleAlert aria-hidden /> : <CircleAlert aria-hidden />}
            <AlertDescription className="text-foreground">
              {failure.text}
              {failure.retry && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => regenerate()}>
                  Try again
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {questionBox}
    </div>
  );
}
