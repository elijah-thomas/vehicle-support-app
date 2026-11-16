import { expect, test } from "vitest";
import type { Case, TelematicsEvent } from "@/lib/customer/vehicles";
import { casesForModel, telematicsForModel } from "./model-context";

// A model that never sees an internal ID can't quote one to a rep. See docs/decisions.md#call-summary-generation
const CUID = /\bc[a-z0-9]{24}\b/;

const cases: Case[] = [
  {
    id: "cmwii451l000vj74yw7td0nev", status: "OPEN", category: "Electrical", subject: "Backup camera goes black",
    description: "Goes black.", openedAt: "2026-11-10T00:00:00Z", closedAt: null, resolution: null,
    notes: [{ id: "cmwii451l000vj74yw7td0nex", source: "REP", issue: "Camera", summary: "Called.", nextSteps: ["Book"], createdAt: "2026-11-11T00:00:00Z" }],
  },
];
const telematics: TelematicsEvent[] = [
  { id: "cmwii451l000vj74yw7td0ney", recordedAt: "2026-11-09T00:00:00Z", type: "SOFTWARE", code: null, severity: "WARN", message: "Restart", value: null },
];

test("strips every internal ID, including those of nested notes", () => {
  const seen = JSON.stringify({ cases: casesForModel(cases), telematics: telematicsForModel(telematics) });
  expect(seen).not.toMatch(CUID);
  expect(seen).toContain("Backup camera goes black");
  expect(seen).toContain("Restart");
});

test("passes 'not found' through as null", () => {
  expect(casesForModel(null)).toBeNull();
  expect(telematicsForModel(null)).toBeNull();
});
