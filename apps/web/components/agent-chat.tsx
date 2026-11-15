"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentAnswer } from "@/components/agent-answer";
import { AgentToolStep } from "@/components/agent-tool-step";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { VehicleAgentMessage } from "@/lib/ai/vehicle-agent";

const cannedPrompts = [
  "Summarize this vehicle's status",
  "Is this a recurring issue?",
  "What changed since the last contact?",
  "Could an open recall explain the complaint?",
  "What should I tell the customer?",
];

const MAX_TEXT_LENGTH = 2000;

function errorCopy(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("429") || message.includes("too many")) {
    return { title: "Too many questions", body: "The assistant is rate-limited. Wait a minute, then ask again." };
  }
  if (message.includes("too long") || message.includes("413")) {
    return { title: "Question too long", body: `Keep questions under ${MAX_TEXT_LENGTH.toLocaleString()} characters.` };
  }
  return { title: "The assistant couldn't answer", body: "The vehicle record is still on this page. Try again in a moment." };
}

export function AgentChat({ vin }: { vin: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop } = useChat<VehicleAgentMessage>({
    transport: new DefaultChatTransport({ api: "/api/agent", body: { vin } }),
  });
  const busy = status === "submitted" || status === "streaming";
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status]);

  function ask(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  const failure = error ? errorCopy(error) : null;

  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Assistant
        </CardTitle>
        <CardDescription>Answers use only this vehicle&apos;s record and show what was checked.</CardDescription>
      </CardHeader>

      <CardContent
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        className="max-h-[60vh] min-h-40 flex-1 space-y-5 overflow-y-auto py-4 xl:max-h-none"
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Start with</p>
            <div className="flex flex-col items-start gap-2">
              {cannedPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-7 py-1 text-left whitespace-normal"
                  onClick={() => ask(prompt)}
                >
                  {prompt}
                </Button>
              ))}
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
          <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
            <AlertTitle>{failure.title}</AlertTitle>
            <AlertDescription>{failure.body}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t bg-card p-3"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this vehicle"
          aria-label="Ask about this vehicle"
          maxLength={MAX_TEXT_LENGTH}
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
      </form>
    </Card>
  );
}
