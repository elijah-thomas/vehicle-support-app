import { expect, test, vi } from "vitest";
import type { Case, TelematicsEvent, Vehicle } from "@/lib/customer/vehicles";

// Only the pure rules are under test; the data layer needs env and the network.
vi.mock("@/lib/customer/vehicles", () => ({ getVehicle: vi.fn(), getTelematics: vi.fn() }));
vi.mock("@/lib/case-snapshot", () => ({ getCaseSnapshot: vi.fn() }));
const { suggestionsFor } = await import("./assistant-suggestions");

const now = Date.parse("2026-11-15T00:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const vehicle = (firstName: string, openRecall?: string): Vehicle => ({
  vin: "0MRAE4LR5RA100001",
  color: "Glacier White",
  purchasedAt: daysAgo(400),
  softwareVersion: "24.3.1",
  installedOptions: [],
  model: {
    year: 2024, make: "Meridian", model: "Aster EV", trim: "Long Range", powertrain: "EV",
    batteryKwh: 102, rangeMiles: 310, engine: null, towingLbs: 3500,
  },
  customer: { firstName, lastName: "Example", email: "someone@example.com", phone: "555-0100", vehicles: [] },
  recalls: openRecall
    ? [{ status: "OPEN", completedAt: null, recall: { campaignNumber: openRecall, title: "", description: "", remedy: "" } }]
    : [],
});

const event = (id: string, days: number, extra: Partial<TelematicsEvent> = {}): TelematicsEvent => ({
  id, recordedAt: daysAgo(days), type: "DTC", code: null, severity: "INFO", message: "Reading", value: null, ...extra,
});

const supportCase = (status: Case["status"]): Case =>
  ({ id: `case-${status}-${Math.random()}`, status, notes: [] }) as unknown as Case;

const texts = (suggestions: { text: string }[]) => suggestions.map((s) => s.text);

test("Dana: a repeat critical fault and an open case", () => {
  const events = [
    event("c", 12, { code: "P0C73", severity: "CRITICAL" }),
    event("odo", 1),
    event("b", 130, { code: "P0C73", severity: "WARN" }),
    event("a", 240, { code: "P0C73", severity: "WARN" }),
  ];
  const result = suggestionsFor({
    vehicle: vehicle("Dana"),
    cases: [supportCase("OPEN"), supportCase("CLOSED"), supportCase("CLOSED")],
    events,
    now,
  });
  expect(result).toEqual([
    { text: "Is P0C73 a recurring issue?", kind: "critical", code: "P0C73" },
    { text: "What's been done on the open case?", kind: "case" },
    { text: "What should I tell Dana?", kind: "customer" },
    { text: "Summarize this vehicle's status", kind: "summary" },
  ]);
});

test("Marcus: an open recall, and a warning without a code is not a fault question", () => {
  const events = [event("cam", 6, { type: "SOFTWARE", severity: "WARN", message: "Rear camera module restarted" })];
  const result = suggestionsFor({ vehicle: vehicle("Marcus", "MR-24-117"), cases: [supportCase("OPEN")], events, now });
  expect(texts(result)).toEqual([
    "What's been done on the open case?",
    "Could recall MR-24-117 explain the complaint?",
    "What should I tell Marcus?",
    "Summarize this vehicle's status",
    "What changed since the last contact?",
  ]);
  expect(result.find((s) => s.kind === "recall")).toBeDefined();
});

test("Jordan's truck: a first-time warning fault", () => {
  const events = [event("p", 4, { code: "P0128", severity: "WARN" }), event("odo", 4)];
  const result = suggestionsFor({ vehicle: vehicle("Jordan"), cases: [], events, now });
  expect(result[0]).toEqual({ text: "What does P0128 mean for this vehicle?", kind: "warning", code: "P0128" });
  expect(texts(result)).not.toContain("What changed since the last contact?");
});

test("Priya: a healthy car gets no fault questions", () => {
  const result = suggestionsFor({ vehicle: vehicle("Priya"), cases: [], events: [event("odo", 1)], now });
  expect(texts(result)).toEqual([
    "What should I tell Priya?",
    "Summarize this vehicle's status",
    "What changed since the last contact?",
  ]);
});

test("more than one open case, and a fault older than 30 days, are worded accordingly", () => {
  const result = suggestionsFor({
    vehicle: vehicle(""),
    cases: [supportCase("OPEN"), supportCase("OPEN")],
    events: [event("old", 45, { code: "P0420", severity: "WARN" })],
    now,
  });
  expect(texts(result)).toEqual([
    "What's been done on the open cases?",
    "What should I tell the customer?",
    "Summarize this vehicle's status",
    "What changed since the last contact?",
  ]);
});

test("never more than 5", () => {
  const result = suggestionsFor({
    vehicle: vehicle("Dana", "MR-24-117"),
    cases: [supportCase("OPEN")],
    events: [event("c", 2, { code: "P0C73", severity: "CRITICAL" })],
    now,
  });
  expect(result).toHaveLength(5);
  expect(texts(result).at(-1)).toBe("Summarize this vehicle's status");
});

test("a record that can't be read falls back to the general questions", async () => {
  const { getVehicle } = await import("@/lib/customer/vehicles");
  vi.mocked(getVehicle).mockRejectedValueOnce(new Error("vehicle API down"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { loadSuggestions, FALLBACK_SUGGESTIONS } = await import("./assistant-suggestions");
  expect(await loadSuggestions("0MRAE4LR5RA100001")).toEqual(FALLBACK_SUGGESTIONS);
});
