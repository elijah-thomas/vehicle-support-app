import { z } from "zod";

// Decision (D28): for the Eve version, the tab keeps only the conversation's ID, one per vehicle;
// after a reload Eve replays the conversation from the server. Why: no customer details are stored
// in the browser. Trade-off: a reload takes a moment to replay. See docs/decisions.md#eve-assistant
const key = (vin: string) => `vs:eve-chat:${vin}`;
const sessionIdSchema = z.string().min(1).max(200);

export function loadEveSession(vin: string): string | null {
  try {
    const parsed = sessionIdSchema.safeParse(window.sessionStorage.getItem(key(vin)));
    return parsed.success ? parsed.data : null;
  } catch {
    // Blocked storage: start a new conversation.
    return null;
  }
}

export function storeEveSession(vin: string, sessionId: string | null) {
  try {
    if (sessionId) window.sessionStorage.setItem(key(vin), sessionId);
    else window.sessionStorage.removeItem(key(vin));
  } catch {
    // Storage blocked or full: the chat still works, it just won't survive a reload.
  }
}
