// Decision (D28): two versions of the assistant, picked per tab; the AI SDK one is the default.
// See docs/decisions.md#eve-assistant
export const assistantEngines = ["ai-sdk", "eve"] as const;
export type AssistantEngine = (typeof assistantEngines)[number];

const key = "vs:assistant-engine";

export function loadAssistantEngine(): AssistantEngine {
  try {
    const stored = window.sessionStorage.getItem(key);
    return assistantEngines.find((engine) => engine === stored) ?? "ai-sdk";
  } catch {
    return "ai-sdk";
  }
}

export function storeAssistantEngine(engine: AssistantEngine) {
  try {
    window.sessionStorage.setItem(key, engine);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}
