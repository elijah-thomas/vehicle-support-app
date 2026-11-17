import { describe, expect, test } from "vitest";
import type { Case, TelematicsEvent } from "@/lib/customer/vehicle-records";
import {
  daysBetween,
  faultWindow,
  isReopenNote,
  lastContact,
  matchFaultsToCases,
  relatedFaults,
  sortCases,
} from "./cases";

const utc = (date: string) => `${date}T15:00:00Z`;
const supportCase = (id: string, opened: string, extra: Partial<Case> = {}): Case => ({
  id, number: 24101, status: "CLOSED", category: "Battery & Charging", subject: id, description: "", openedAt: utc(opened),
  closedAt: null, resolution: null, notes: [], ...extra,
});
const note = (date: string) => ({ id: date, source: "REP" as const, issue: "", summary: "", nextSteps: ["x"], createdAt: utc(date) });
const fault = (id: string, date: string, code: string | null = "P0C73"): TelematicsEvent => ({
  id, recordedAt: utc(date), type: code ? "DTC" : "ODOMETER", code, severity: "WARN", message: "", value: null,
});

test("last contact is the newest note, or the opening when there are none", () => {
  expect(lastContact(supportCase("quiet", "2026-11-01"))).toBe(utc("2026-11-01"));
  expect(lastContact(supportCase("called", "2026-11-01", { notes: [note("2026-11-12"), note("2026-11-05")] }))).toBe(utc("2026-11-12"));
});

test("a reopen is recognized by the note the API writes for it", () => {
  expect(isReopenNote({ ...note("2026-11-12"), issue: "Case reopened" })).toBe(true);
  expect(isReopenNote({ ...note("2026-11-12"), issue: "Case reopened", source: "AI_DRAFT_EDITED" })).toBe(false);
  expect(isReopenNote(note("2026-11-12"))).toBe(false);
});

test("lists open cases first, then newest", () => {
  const cases = [supportCase("old", "2026-01-01"), supportCase("new", "2026-10-01"), supportCase("open", "2026-05-01", { status: "OPEN" })];
  expect(sortCases(cases).map((c) => c.id)).toEqual(["open", "new", "old"]);
});

describe("related faults", () => {
  const events = [fault("third", "2026-11-03"), fault("odometer", "2026-11-04", null), fault("second", "2026-07-09"), fault("late", "2026-07-20")];
  const current = supportCase("current", "2026-11-05");
  const earlier = supportCase("earlier", "2026-07-11");

  test("matches coded faults logged in the week before the case opened", () => {
    expect(relatedFaults(current, events).map((e) => e.id)).toEqual(["third"]);
    expect(relatedFaults(earlier, events).map((e) => e.id)).toEqual(["second"]);
  });

  test("the fetched window is the 7 days up to the moment the case opened", () => {
    expect(faultWindow(current)).toEqual({ from: "2026-10-29T15:00:00.000Z", to: "2026-11-05T15:00:00.000Z" });
  });
});

describe("matchFaultsToCases", () => {
  // Dana's story: P0C73 three times, and a case opened within the week after each.
  const events = [
    fault("third", "2026-11-03"),
    fault("battery", "2026-11-03", null),
    fault("second", "2026-07-09"),
    fault("first", "2026-03-21"),
    fault("orphan", "2026-01-02", "P0128"),
  ];
  const cases = [
    supportCase("open", "2026-11-05", { status: "OPEN" }),
    supportCase("returned", "2026-07-11"),
    supportCase("charging", "2026-03-23"),
    supportCase("unrelated", "2026-05-01"),
  ];
  const { faultForCase, caseForEvent } = matchFaultsToCases(cases, events);

  test("each case gets the coded fault from the week before it opened", () => {
    expect(faultForCase.get("open")?.id).toBe("third");
    expect(faultForCase.get("returned")?.id).toBe("second");
    expect(faultForCase.get("charging")?.id).toBe("first");
    expect(faultForCase.has("unrelated")).toBe(false);
  });

  test("each fault links to the case it led to; a fault with no case, or no code, links nowhere", () => {
    expect(caseForEvent.get("third")?.id).toBe("open");
    expect(caseForEvent.get("first")?.id).toBe("charging");
    expect(caseForEvent.has("orphan")).toBe(false);
    expect(caseForEvent.has("battery")).toBe(false);
  });

  test("a case opened more than 7 days after the fault isn't matched", () => {
    const late = matchFaultsToCases([supportCase("late", "2026-03-30")], [fault("first", "2026-03-21")]);
    expect(late.caseForEvent.size).toBe(0);
  });

  test("counts whole days from fault to case", () => {
    expect(daysBetween(utc("2026-11-03"), utc("2026-11-05"))).toBe(2);
    expect(daysBetween(utc("2026-11-03"), utc("2026-11-03"))).toBe(0);
  });
});
