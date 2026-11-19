"use client";

import { ArrowUp, Car, CircleAlert, FileText, MessageSquare, RotateCcw, ShieldAlert, Square, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Suspense, use, useEffect, useId, useRef, useState } from "react";
import { AgentAnswer } from "@/components/assistant/agent-answer";
import { AgentToolStep } from "@/components/assistant/agent-tool-step";
import { TypingIndicator } from "@/components/assistant/typing-indicator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_TEXT_LENGTH } from "@/lib/ai/agent-request";
import type { AiErrorCode } from "@/lib/assistant/ai-request-error";
import type { Suggestion, SuggestionKind } from "@/lib/assistant/assistant-suggestions";

const suggestionIcons: Record<SuggestionKind, { Icon: LucideIcon; className: string }> = {
  critical: { Icon: TriangleAlert, className: "text-destructive" },
  warning: { Icon: TriangleAlert, className: "text-warning" },
  case: { Icon: FileText, className: "text-info" },
  recall: { Icon: ShieldAlert, className: "text-warning" },
  customer: { Icon: MessageSquare, className: "text-muted-foreground" },
  summary: { Icon: Car, className: "text-muted-foreground" },
};

const MAX_FOLLOW_UPS = 2;

function errorCopy(code: AiErrorCode) {
  switch (code) {
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

// One message as the panel shows it, whichever engine wrote it (D28): tool steps, then text.
export type ChatViewMessage = {
  id: string;
  role: "user" | "assistant";
  texts: string[];
  tools: { type: string; state?: string }[];
};

// vin and suggestions are null while the page's params resolve: the same empty state renders
// disabled, so it can be the Suspense fallback and prerender in the static shell.
// See docs/decisions.md#caching
export type ChatViewProps = {
  vin: string | null;
  suggestions: Promise<Suggestion[]> | null;
  messages: ChatViewMessage[];
  /** A question is out: show Stop instead of Ask. */
  busy: boolean;
  /** The question is sent and the record is being read; the model hasn't started. */
  reading: boolean;
  /** The model is working on the answer. */
  answering: boolean;
  /** Nothing is running and the last answer finished: offer follow-ups. */
  settled: boolean;
  error: AiErrorCode | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onNewChat: () => void;
};

const noop = () => {};

// The disabled panel, before the vehicle is known or while an engine's client loads. Given the
// suggestions, it keeps their space so the panel doesn't jump when the engine arrives.
export function AgentChatPlaceholder({ suggestions = null }: { suggestions?: Promise<Suggestion[]> | null }) {
  return (
    <AgentChatView
      vin={null}
      suggestions={suggestions}
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

export function AgentChatView({
  vin,
  suggestions,
  messages,
  busy,
  reading,
  answering,
  settled,
  error,
  onSend,
  onStop,
  onRetry,
  onNewChat,
}: ChatViewProps) {
  const loading = vin === null;
  // Both engines' panels can be in the page at once (one hidden), so ids are per panel.
  const id = useId();
  const scopeId = `${id}-scope`;
  const suggestionsId = `${id}-suggestions`;
  const [input, setInput] = useState("");
  const started = messages.length > 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The question box moves from the top to the bottom on the first question, and back on New chat,
  // which remounts it. Focus follows only if it was already in the chat; on page load the lookup
  // owns focus (`/`).
  const refocus = useRef(false);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy, answering]);

  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [started]);

  function newChat() {
    onNewChat();
    setInput("");
    refocus.current = true;
  }

  function ask(text: string) {
    if (!text.trim() || busy || loading) return;
    if (!started) refocus.current = rootRef.current?.contains(document.activeElement) ?? false;
    onSend(text);
    setInput("");
  }

  const failure = error ? errorCopy(error) : null;
  const asked = new Set(messages.flatMap((m) => (m.role === "user" ? m.texts : [])));
  const showFollowUps = settled && messages.at(-1)?.role === "assistant";
  // The record is read and the model is working, but no words have arrived. The bubble goes in the
  // answer once the stream has opened one, and on its own before that, so "Assistant" shows once.
  const last = messages.at(-1);
  const answerStarted = last?.role === "assistant";
  const waitingForWords = busy && answering && !(answerStarted && last.texts.some((text) => text.trim()));

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
          aria-describedby={scopeId}
        />
        {busy ? (
          <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Stop answering">
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Ask">
            <ArrowUp />
          </Button>
        )}
      </div>
      {/* The assistant gets only this vehicle's record (D16), so the rep knows not to ask about
          other vehicles or policy. */}
      <div className="flex items-center justify-between gap-2">
        <p id={scopeId} className="text-xs text-muted-foreground">
          Answers use only this vehicle&apos;s record, telematics and case history.
        </p>
        {started && (
          <Button type="button" variant="ghost" size="xs" onClick={newChat} disabled={busy} className="shrink-0 text-muted-foreground">
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
        <section aria-labelledby={suggestionsId} className="space-y-2">
          <h3 id={suggestionsId} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
              {message.texts.map((text, i) => (
                <p key={i} className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                  {text}
                </p>
              ))}
            </div>
          ) : (
            <div key={message.id} className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Assistant</span>
              {message.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Sources checked">
                  {message.tools.map((tool, i) => (
                    <AgentToolStep key={i} type={tool.type} state={tool.state} />
                  ))}
                </div>
              )}
              {vin && message.texts.map((text, i) => <AgentAnswer key={i} vin={vin} text={text} />)}
              {message === last && waitingForWords && <TypingIndicator />}
              {message === messages.at(-1) && showFollowUps && suggestions && (
                <Suspense fallback={null}>
                  <FollowUps suggestions={suggestions} asked={asked} onAsk={ask} />
                </Suspense>
              )}
            </div>
          ),
        )}

        {reading && (
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
                <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
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
