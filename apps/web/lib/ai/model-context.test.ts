import { expect, test } from "vitest";
import type { Case, TelematicsEvent, Vehicle } from "@/lib/customer/reads";
import { UNAVAILABLE, earlierNextStepsForModel, vehicleRecordForModel } from "./model-context";

// A model that never sees an internal ID can't quote one to a rep. See docs/decisions.md#agent-context
const CUID = /\bc[a-z0-9]{24}\b/;

const vehicle: Vehicle = {
  vin: "0MRKC15V8PA200002", color: "Granite Gray", purchasedAt: "2024-12-15T10:00:00Z", softwareVersion: "23.9.4",
  installedOptions: ["Bed Liner"],
  model: { year: 2023, make: "Meridian", model: "Kestrel 1500", trim: "Crew Cab", powertrain: "GAS", batteryKwh: null, rangeMiles: null, engine: "5.3L V8", towingLbs: 11000 },
  customer: { firstName: "Marcus", lastName: "Bell", email: "marcus.bell@example.com", phone: "555-0102", vehicles: [] },
  recalls: [{ status: "OPEN", completedAt: null, recall: { campaignNumber: "MR-24-117", title: "Rear camera", description: "Goes black.", remedy: "Update." } }],
};
const cases: Case[] = [
  {
    id: "cmwii451l000vj74yw7td0nev", number: 24117, status: "OPEN", category: "Electrical", subject: "Backup camera goes black",
    description: "Goes black.", openedAt: "2026-11-10T23:30:00Z", closedAt: null, resolution: null,
    notes: [{ id: "cmwii451l000vj74yw7td0nex", source: "REP", issue: "Camera", summary: "Called.", nextSteps: ["Book"], createdAt: "2026-11-11T00:00:00Z" }],
  },
];
const event = (id: string, recordedAt: string): TelematicsEvent => ({
  id, recordedAt, type: "SOFTWARE", code: null, severity: "WARN", message: "Rear camera module restarted", value: null,
});
const telematics = [event("cmwii451l000vj74yw7td0ne1", "2026-11-09T00:00:00Z"), event("cmwii451l000vj74yw7td0ne2", "2026-10-26T00:00:00Z")];
const asOf = new Date("2026-11-15T12:00:00Z");

test("strips every internal ID, including those of nested notes", () => {
  const text = vehicleRecordForModel({ vehicle, cases, telematics }, asOf);
  expect(text).not.toMatch(CUID);
  expect(text).toContain("Backup camera goes black");
});

test("gives case numbers, which reps use, but never the owner's phone number", () => {
  const text = vehicleRecordForModel({ vehicle, cases, telematics }, asOf);
  expect(text).toContain('"caseNumber":"CS-24117"');
  expect(text).not.toContain("555-0102");
});

test("leaves out the issue of a note that has none", () => {
  const quickNote = { ...cases[0].notes[0], issue: null };
  const text = vehicleRecordForModel({ vehicle, cases: [{ ...cases[0], notes: [quickNote] }], telematics }, asOf);
  expect(text).not.toContain('"issue"');
  expect(text).toContain('"summary":"Called."');
});

test("gives dates in the format answers use, in UTC", () => {
  const text = vehicleRecordForModel({ vehicle, cases, telematics }, asOf);
  expect(text).toContain('as_of="Nov 15, 2026"');
  expect(text).toContain('"opened":"Nov 10, 2026"');
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
});

test("states how often an event repeats, so the model doesn't have to count", () => {
  const text = vehicleRecordForModel({ vehicle, cases, telematics }, asOf);
  expect(text).toContain('"occurrence":"2 of 2 in these events"');
  expect(text).toContain('"occurrence":"1 of 2 in these events"');
});

test("marks a source that couldn't load, so it isn't mistaken for an empty one", () => {
  const text = vehicleRecordForModel({ vehicle, cases: UNAVAILABLE, telematics: [] }, asOf);
  expect(text).toContain("<cases>unavailable</cases>");
  expect(text).toContain("<telematics>[]</telematics>");
});

test("gives an open case's days since its last update, so the model doesn't do date math", () => {
  const closed = { ...cases[0], status: "CLOSED" as const, closedAt: "2026-11-12T00:00:00Z" };
  const record = { vehicle, cases: [cases[0], { ...closed, number: 24118 }], telematics };
  const text = vehicleRecordForModel(record, asOf, { caseAge: true });
  expect(text).toContain('"lastUpdate":"Nov 11, 2026","daysSinceUpdate":4');
  expect(text.match(/daysSinceUpdate/g)).toHaveLength(1);
  expect(vehicleRecordForModel(record, asOf)).not.toContain("daysSinceUpdate");
});

test("lists the next steps earlier answers gave, or none on the first answer", () => {
  expect(earlierNextStepsForModel([])).toBe("<earlier_next_steps>none</earlier_next_steps>");
  const answer = "Recurring fault.\n- P0C73 logged Nov 5.\nNext steps:\n- Confirm Dana is safe.\n- Ask the review team.";
  expect(earlierNextStepsForModel([answer, "Status only.\n- No change."])).toBe(
    "<earlier_next_steps>\n- Confirm Dana is safe.\n- Ask the review team.\n</earlier_next_steps>",
  );
});
