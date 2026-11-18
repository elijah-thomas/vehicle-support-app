import { z } from "zod";
import { agentMessageSchema } from "@/lib/ai/agent-request";
import type { VehicleAgentMessage } from "@/lib/ai/vehicle-agent";

// The route's own message check (D27), so a restored thread is one the route will accept.
const storedSchema = z.object({
  messages: z.array(z.intersection(z.object({ id: z.string().min(1) }), agentMessageSchema)),
  // True from the moment a question is sent until its answer ends. A reload in between left the
  // question unanswered, so the chat asks it again. A failed question is stored as not pending.
  pending: z.boolean(),
});

export type StoredAgentChat = { messages: VehicleAgentMessage[]; pending: boolean };

// Decision (D48): the assistant thread lives in sessionStorage, one entry per vehicle, like the
// call summary draft (D46). Why: a reload keeps the conversation, and closing the tab removes
// customer details from shared machines. Trade-off: a second tab or a crash starts empty.
// See docs/decisions.md#chat-reload
const key = (vin: string) => `vs:agent-chat:${vin}`;

export function loadAgentChat(vin: string): StoredAgentChat | null {
  try {
    const raw = window.sessionStorage.getItem(key(vin));
    const parsed = raw ? storedSchema.safeParse(JSON.parse(raw)) : null;
    if (!parsed?.success || parsed.data.messages.length === 0) return null;
    // The schema checks what the route checks; the parts beyond that are the SDK's own.
    return parsed.data as StoredAgentChat;
  } catch {
    // Blocked storage or a corrupt entry: start with an empty chat.
    return null;
  }
}

export function storeAgentChat(vin: string, value: StoredAgentChat) {
  try {
    if (value.messages.length === 0) window.sessionStorage.removeItem(key(vin));
    else window.sessionStorage.setItem(key(vin), JSON.stringify(value));
  } catch {
    // Storage blocked or full: the chat still works, it just won't survive a reload.
  }
}
