import { MAX_TEXT_LENGTH } from "@/lib/ai/agent-request";

// Same limits as the AI SDK version's route and step cap (D16).
export const MAX_MODEL_CALLS = 3;

type QuestionPart = { kind: "text"; text: string } | { kind: string };

export function questionTooLong(parts: readonly QuestionPart[]): boolean {
  const text = parts.map((part) => ("text" in part ? part.text : "")).join("");
  return text.length > MAX_TEXT_LENGTH;
}

export function overStepCap(modelCallsInTurn: number): boolean {
  return modelCallsInTurn > MAX_MODEL_CALLS;
}
