import { z } from "zod";
import { VIN_PATTERN } from "@/lib/format";

// The browser sends the whole conversation, so everything in it is untrusted. Only what the chat
// UI itself produces is accepted: user messages are text only, roles are user or assistant
// (assistant parts carry the earlier tool results), and the total size is bounded.
// See docs/decisions.md#agent-request
export const MAX_MESSAGES = 10;
export const MAX_TEXT_LENGTH = 2000;
// Sized for real follow-ups, whose assistant turns carry full tool results, not just demo data.
export const MAX_REQUEST_CHARS = 80_000;

const part = z.looseObject({ type: z.string() });
const message = z.discriminatedUnion("role", [
  z.looseObject({ role: z.literal("user"), parts: z.array(z.looseObject({ type: z.literal("text"), text: z.string() })) }),
  z.looseObject({ role: z.literal("assistant"), parts: z.array(part) }),
]);

const requestSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN),
  messages: z.array(message).min(1),
});

type Messages = z.infer<typeof requestSchema>["messages"];
export type AgentRequest =
  | { ok: true; vin: string; messages: Messages }
  | { ok: false; code: "invalid_request" | "too_long"; status: 400 | 413 };

const invalid = { ok: false, code: "invalid_request", status: 400 } as const;

export function parseAgentRequest(body: unknown): AgentRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalid;
  const { vin, messages } = parsed.data;

  const last = messages.at(-1);
  const question = last?.role === "user" ? last.parts.map((p) => p.text).join("").trim() : "";
  if (!question) return invalid;

  // Measured on what the model will actually see, so a long conversation isn't refused for
  // messages that are trimmed anyway.
  const recent = messages.slice(-MAX_MESSAGES);
  const tooLong =
    recent.some((m) => m.role === "user" && m.parts.some((p) => p.text.length > MAX_TEXT_LENGTH)) ||
    JSON.stringify(recent).length > MAX_REQUEST_CHARS;
  if (tooLong) return { ok: false, code: "too_long", status: 413 };

  return { ok: true, vin, messages: recent.map(withoutOldToolResults) };
}

// Earlier turns' tool results come from the browser, so they could be forged, and the server
// reloads the record on every request anyway. Text and reasoning stay: Gemini needs its reasoning
// (with its signatures) sent back as it was. See docs/decisions.md#agent-context
function withoutOldToolResults(message: Messages[number]): Messages[number] {
  if (message.role !== "assistant") return message;
  return { ...message, parts: message.parts.filter((part) => part.type === "text" || part.type === "reasoning") };
}
