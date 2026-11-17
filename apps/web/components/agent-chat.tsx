"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, CircleAlert, Square, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { AgentAnswer } from "@/components/agent-answer";
import { AgentToolStep } from "@/components/agent-tool-step";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiErrorCode } from "@/lib/ai-request-error";
import type { VehicleAgentMessage } from "@/lib/ai/vehicle-agent";

const primaryPrompts = [
  "Summarize this vehicle's status",
  "Is this a recurring issue?",
  "What should I tell the customer?",
];
const morePrompts = ["What changed since the last contact?", "Could an open recall explain the complaint?"];
const allPrompts = [...primaryPrompts, ...morePrompts];

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

// vin is null while the page's params resolve: the same empty state renders disabled, so it can be
// the Suspense fallback and prerender in the static shell. See docs/decisions.md#vehicle-page-caching
export function AgentChat({ vin }: { vin: string | null }) {
  const loading = vin === null;
  const [input, setInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const { messages, sendMessage, regenerate, status, error, stop } = useChat<VehicleAgentMessage>({
    transport: new DefaultChatTransport({ api: "/api/agent", body: { vin } }),
  });
  const busy = status === "submitted" || status === "streaming";
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status]);

  function ask(text: string) {
    if (!text.trim() || busy || loading) return;
    sendMessage({ text });
    setInput("");
  }

  const failure = error ? errorCopy(error) : null;
  const asked = new Set(
    messages.flatMap((m) => (m.role === "user" ? m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])) : [])),
  );
  const followUps =
    status === "ready" && messages.at(-1)?.role === "assistant"
      ? allPrompts.filter((prompt) => !asked.has(prompt)).slice(0, MAX_FOLLOW_UPS)
      : [];

  return (
    <>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={busy || loading}
        className={cn(
          "max-h-[60vh] min-h-40 flex-1 overflow-y-auto p-4 lg:max-h-none",
          messages.length === 0 ? "flex flex-col justify-end" : "space-y-5",
        )}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Start with</p>
            <div className="flex flex-col items-start gap-2">
              {(showMore ? allPrompts : primaryPrompts).map((prompt) => (
                <PromptButton key={prompt} prompt={prompt} onAsk={ask} disabled={loading} />
              ))}
              {!showMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-accent-foreground"
                  onClick={() => setShowMore(true)}
                  disabled={loading}
                >
                  {morePrompts.length} more questions
                </Button>
              )}
            </div>
          </div>
        )}

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
              {message.parts.map((part, i) => (part.type === "text" ? <AgentAnswer key={i} text={part.text} /> : null))}
              {message === messages.at(-1) && followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Follow-up questions">
                  {followUps.map((prompt) => (
                    <PromptButton key={prompt} prompt={prompt} onAsk={ask} />
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {status === "submitted" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden />
            Reading the record…
          </p>
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="space-y-2 border-t bg-card p-3"
      >
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about this vehicle"
            aria-label="Ask about this vehicle"
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
            other vehicles or policy. Under the input, it applies to every answer. */}
        <p id="agent-scope" className="text-xs text-muted-foreground">
          Answers use only this vehicle&apos;s record.
        </p>
      </form>
    </>
  );
}
