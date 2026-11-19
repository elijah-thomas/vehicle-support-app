"use client";

import { cn } from "cn";
import { Activity, lazy, Suspense, useState, useSyncExternalStore } from "react";
import { AgentChat } from "@/components/assistant/agent-chat";
import { AgentChatPlaceholder } from "@/components/assistant/agent-chat-view";
import { loadAssistantEngine, storeAssistantEngine, type AssistantEngine } from "@/lib/assistant/assistant-engine";
import type { Suggestion } from "@/lib/assistant/assistant-suggestions";

type Props = { vin: string | null; suggestions: Promise<Suggestion[]> | null };

const subscribeNever = () => () => {};

const labels: Record<AssistantEngine, string> = { "ai-sdk": "AI SDK", eve: "Eve" };

// Eve's client (about 130 KB compressed) loads only when a tab picks Eve, so the default AI SDK
// panel doesn't pay for it. It starts loading when the pointer or focus reaches the switch's Eve
// option; until it arrives, the panel keeps its suggestions in place, disabled.
const loadEveChat = () => import("@/components/assistant/eve-chat");
const EveChat = lazy(() => loadEveChat().then((m) => ({ default: m.EveChat })));

// The tab's engine choice is read once hydrated; the server render and the static shell show
// the default.
export function AskTab(props: Props) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  return <AskTabPanel key={hydrated ? "hydrated" : "pending"} hydrated={hydrated} {...props} />;
}

// Decision (D28): a switch picks which version answers; each keeps its own conversation, so
// switching back finds the earlier one. See docs/decisions.md#eve-assistant
function AskTabPanel({ hydrated, vin, suggestions }: Props & { hydrated: boolean }) {
  const [engine, setEngine] = useState<AssistantEngine>(() => (hydrated ? loadAssistantEngine() : "ai-sdk"));
  // Each engine's panel stays mounted once opened and is hidden while the other shows, so
  // switching back doesn't rebuild it (Eve would flash its empty state while it replays).
  const [eveOpened, setEveOpened] = useState(engine === "eve");

  function choose(next: AssistantEngine) {
    setEngine(next);
    if (next === "eve") setEveOpened(true);
    storeAssistantEngine(next);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-1.5">
        <span id="assistant-engine" className="text-xs text-muted-foreground">
          Engine
        </span>
        <div role="radiogroup" aria-labelledby="assistant-engine" className="flex rounded-md bg-muted p-0.5">
          {(Object.keys(labels) as AssistantEngine[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={engine === option}
              disabled={!hydrated}
              onClick={() => choose(option)}
              onPointerEnter={option === "eve" ? loadEveChat : undefined}
              onFocus={option === "eve" ? loadEveChat : undefined}
              className={cn(
                "h-6 rounded-sm px-2 text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                engine === option && "bg-card text-foreground shadow-sm",
              )}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      </div>
      <Activity mode={engine === "ai-sdk" ? "visible" : "hidden"}>
        <AgentChat vin={vin} suggestions={suggestions} />
      </Activity>
      {eveOpened && (
        <Activity mode={engine === "eve" ? "visible" : "hidden"}>
          <Suspense fallback={<AgentChatPlaceholder suggestions={suggestions} />}>
            <EveChat vin={vin} suggestions={suggestions} />
          </Suspense>
        </Activity>
      )}
    </>
  );
}
