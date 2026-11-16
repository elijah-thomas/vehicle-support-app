import { describe, expect, test } from "vitest";
import { formatDate, formatRelative, ordinal, telematicsReading } from "./format";

describe("telematicsReading", () => {
  test.each([
    ["Odometer reading (miles)", 18420, "Odometer reading", "18,420 mi"],
    ["Battery state of health (%)", 91, "Battery state of health", "91%"],
    ["Battery pack temperature above normal range (°C)", 48, "Battery pack temperature above normal range", "48 °C"],
    ["Rear camera module restarted unexpectedly", null, "Rear camera module restarted unexpectedly", null],
    ["Value without a unit", 3, "Value without a unit", "3"],
  ])("%s", (message, value, label, shown) => expect(telematicsReading(message, value)).toEqual({ label, value: shown }));
});

describe("formatRelative", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  test.each([
    ["2026-11-15T11:59:30Z", "just now"],
    ["2026-11-15T11:15:00Z", "45 min ago"],
    ["2026-11-15T07:00:00Z", "5 h ago"],
    ["2026-11-14T12:00:00Z", "1 day ago"],
    ["2026-09-16T12:00:00Z", "60 days ago"],
    ["2026-09-15T12:00:00Z", "Sep 15, 2026"],
    ["2026-11-16T12:00:00Z", "just now"],
  ])("%s → %s", (iso, text) => expect(formatRelative(iso, now)).toBe(text));
});

test("dates are UTC, so the page and the assistant agree", () => {
  expect(formatDate("2026-11-10T23:30:00Z")).toBe("Nov 10, 2026");
});

test.each([
  [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [112, "112th"],
])("ordinal(%i) is %s", (n, text) => expect(ordinal(n)).toBe(text));
