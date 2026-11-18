import "server-only";
import { getCaseSnapshot, getTelematicsSnapshot } from "@/lib/customer/snapshots";
import { getVehicle } from "@/lib/customer/cached-reads";
import type { Case, TelematicsEvent, Vehicle } from "@/lib/customer/reads";
import { repeatKey, worstRecentEvent } from "@/lib/telematics";

export type SuggestionKind = "critical" | "warning" | "case" | "recall" | "customer" | "summary";
// `code` marks the fault code inside `text`, so the button can set it in mono.
export type Suggestion = { text: string; kind: SuggestionKind; code?: string };

const MAX_SUGGESTIONS = 5;

export const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { text: "Summarize this vehicle's status", kind: "summary" },
  { text: "Is this a recurring issue?", kind: "summary" },
  { text: "What should I tell the customer?", kind: "customer" },
];

// Rules, not a model call: free, and ready as soon as the record is. Most specific first.
export function suggestionsFor({
  vehicle,
  cases,
  events,
  now,
}: {
  vehicle: Vehicle;
  cases: Case[];
  events: TelematicsEvent[];
  now: number;
}): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // The same fault the status row shows, and the same repeat count.
  const worst = worstRecentEvent(events, now);
  const fault = worst?.code ? worst : null;
  if (fault?.code) {
    const kind = fault.severity === "CRITICAL" ? "critical" : "warning";
    const repeats = events.filter((event) => repeatKey(event) === repeatKey(fault)).length;
    suggestions.push({
      text: repeats > 1 ? `Is ${fault.code} a recurring issue?` : `What does ${fault.code} mean for this vehicle?`,
      kind,
      code: fault.code,
    });
  }

  const openCases = cases.filter((supportCase) => supportCase.status === "OPEN").length;
  if (openCases > 0) {
    suggestions.push({
      text: openCases === 1 ? "What's been done on the open case?" : "What's been done on the open cases?",
      kind: "case",
    });
  }

  const recall = vehicle.recalls.find((r) => r.status === "OPEN");
  if (recall) {
    suggestions.push({ text: `Could recall ${recall.recall.campaignNumber} explain the complaint?`, kind: "recall" });
  }

  suggestions.push({ text: `What should I tell ${vehicle.customer.firstName || "the customer"}?`, kind: "customer" });
  suggestions.push({ text: "Summarize this vehicle's status", kind: "summary" });
  if (!fault) suggestions.push({ text: "What changed since the last contact?", kind: "summary" });

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// The page's own fetchers (cached, or deduped per request), so this adds no calls to GCP. Any
// failed read falls back to the general questions. See docs/decisions.md#assistant-suggestions
export async function loadSuggestions(vin: string): Promise<Suggestion[]> {
  try {
    const [vehicle, caseSnapshot, telematics] = await Promise.all([
      getVehicle(vin),
      getCaseSnapshot(vin),
      getTelematicsSnapshot(vin),
    ]);
    if (!vehicle || !caseSnapshot || !telematics) return FALLBACK_SUGGESTIONS;
    return suggestionsFor({ vehicle, cases: caseSnapshot.cases, events: telematics.events, now: telematics.fetchedAt });
  } catch (error) {
    console.error("assistant suggestions failed to load", error);
    return FALLBACK_SUGGESTIONS;
  }
}
