import type { TelematicsEvent } from "@/lib/customer/vehicles";

// Telematics has no active/cleared state, so "recent" stands in for "active".
// See docs/decisions.md#vehicle-status
export const RECENT_WINDOW_DAYS = 30;

const severityRank = { INFO: 0, WARN: 1, CRITICAL: 2 } as const;

export function repeatKey(event: TelematicsEvent) {
  return event.code ?? event.message;
}

// Events arrive newest first. Returns, for each event id, which occurrence of its code it is
// (1 = first time seen in the fetched events).
export function occurrences(events: TelematicsEvent[]) {
  const seen = new Map<string, number>();
  const result = new Map<string, number>();
  for (const event of [...events].reverse()) {
    const count = (seen.get(repeatKey(event)) ?? 0) + 1;
    seen.set(repeatKey(event), count);
    result.set(event.id, count);
  }
  return result;
}

// Ids of the newest event for each code, which is where #dtc-<code> links land.
export function newestPerCode(events: TelematicsEvent[]) {
  const ids = new Map<string, string>();
  for (const event of events) {
    if (event.code && !ids.has(event.code)) ids.set(event.code, event.id);
  }
  return new Set(ids.values());
}

export function worstRecentEvent(events: TelematicsEvent[], now: number) {
  const cutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let worst: TelematicsEvent | null = null;
  for (const event of events) {
    if (event.severity === "INFO" || new Date(event.recordedAt).getTime() < cutoff) continue;
    if (!worst || severityRank[event.severity] > severityRank[worst.severity]) worst = event;
  }
  return worst;
}
