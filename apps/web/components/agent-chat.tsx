"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const toolLabels: Record<string, string> = {
  "tool-getVehicle": "Checked vehicle, specs, and recalls",
  "tool-getTelematics": "Checked telematics",
  "tool-getCases": "Checked case history",
};

export function AgentChat({ vin }: { vin: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<VehicleAgentMessage>({
    transport: new DefaultChatTransport({ api: "/api/agent", body: { vin } }),
  });
  const busy = status === "submitted" || status === "streaming";

  function ask(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask the assistant</CardTitle>
        <CardDescription>Answers come only from this vehicle&apos;s record, with sources.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {cannedPrompts.map((prompt) => (
              <Button key={prompt} variant="outline" size="sm" onClick={() => ask(prompt)}>
                {prompt}
              </Button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p
                      key={i}
                      className={
                        message.role === "user"
                          ? "inline-block rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                          : "text-sm whitespace-pre-wrap"
                      }
                    >
                      {part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const state = "state" in part ? part.state : undefined;
                  return (
                    <p key={i} className="text-xs text-muted-foreground">
                      {state === "output-available" ? "✓" : state === "output-error" ? "✗" : "…"}{" "}
                      {toolLabels[part.type] ?? part.type}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          ))}
          {status === "submitted" && <p className="text-xs text-muted-foreground">Thinking…</p>}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>The assistant couldn&apos;t answer. Try again in a moment.</AlertDescription>
          </Alert>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about this vehicle"
            aria-label="Ask about this vehicle"
            maxLength={2000}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Ask
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
