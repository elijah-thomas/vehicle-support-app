import { describe, expect, test } from "vitest";
import type { TelematicsEvent } from "@/lib/customer/reads";
import { newestPerCode, occurrences, worstRecentEvent } from "./telematics";

const now = Date.parse("2026-11-15T00:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
const event = (id: string, days: number, extra: Partial<TelematicsEvent> = {}): TelematicsEvent => ({
  id, recordedAt: daysAgo(days), type: "DTC", code: "P0C73", severity: "WARN", message: "Coolant pump", value: null, ...extra,
});

// Newest first, like the API: Dana's third P0C73 is the newest.
const events = [
  event("c", 12, { severity: "CRITICAL" }),
  event("odo", 1, { type: "ODOMETER", code: null, severity: "INFO", message: "Odometer reading (miles)" }),
  event("b", 130),
  event("a", 240),
];

test("counts each code's occurrences oldest to newest", () => {
  expect(Object.fromEntries(occurrences(events))).toEqual({ a: 1, b: 2, c: 3, odo: 1 });
});

test("links point at the newest event for each code", () => {
  expect(newestPerCode(events)).toEqual(new Set(["c"]));
});

describe("worstRecentEvent", () => {
  test("picks the most severe event inside the 30-day window", () => {
    expect(worstRecentEvent(events, now)?.id).toBe("c");
  });
  test("ignores INFO events and anything older than 30 days", () => {
    expect(worstRecentEvent([event("old", 31, { severity: "CRITICAL" }), events[1]], now)).toBeNull();
  });
  test("returns null for a healthy vehicle", () => {
    expect(worstRecentEvent([], now)).toBeNull();
  });
});
