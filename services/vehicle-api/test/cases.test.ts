import { describe, expect, test } from "vitest";
import { call, useApi, VIN } from "./api.js";

useApi();

const note = { source: "AI_DRAFT_EDITED", issue: "Camera blackouts", summary: "Customer called.", nextSteps: ["Book recall"] };

async function firstCaseId(vin: string) {
  return (await call(`/vehicles/${vin}/cases`)).body[0].id as string;
}

describe("POST /cases", () => {
  test("opens a case owned by the vehicle's customer", async () => {
    const { status, body } = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck.toLowerCase(), category: "Electrical", subject: "Radio static", description: "Static on FM." },
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({ vin: VIN.jordanTruck, status: "OPEN" });

    const vehicle = (await call(`/vehicles/${VIN.jordanTruck}`)).body;
    expect(body.customerId).toBe(vehicle.customer.id);
  });

  test("returns 404 for an unknown vehicle", async () => {
    const { status } = await call("/cases", {
      method: "POST",
      json: { vin: "0MRAE4LR5RA999999", category: "Electrical", subject: "x", description: "x" },
    });
    expect(status).toBe(404);
  });

  test("rejects blank fields after trimming", async () => {
    const { status } = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck, category: "  ", subject: "x", description: "x" },
    });
    expect(status).toBe(400);
  });
});

describe("POST /cases/:id/notes", () => {
  test("adds a note to the vehicle's case, and it shows up newest first", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const { status, body } = await call(`/cases/${caseId}/notes`, { method: "POST", json: { ...note, vin: VIN.marcus } });
    expect(status).toBe(201);

    const cases = (await call(`/vehicles/${VIN.marcus}/cases`)).body;
    expect(cases[0].notes[0].id).toBe(body.id);
  });

  test("refuses a note for a case that belongs to another vehicle", async () => {
    const danaCase = await firstCaseId(VIN.dana);
    const { status } = await call(`/cases/${danaCase}/notes`, { method: "POST", json: { ...note, vin: VIN.marcus } });
    expect(status).toBe(404);

    const notes = (await call(`/vehicles/${VIN.dana}/cases`)).body[0].notes;
    expect(notes).toEqual([]);
  });

  test("refuses a note without the vehicle's VIN", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    expect((await call(`/cases/${caseId}/notes`, { method: "POST", json: note })).status).toBe(400);
  });

  test("returns 404 for a case that doesn't exist", async () => {
    const { status } = await call("/cases/does-not-exist/notes", { method: "POST", json: { ...note, vin: VIN.marcus } });
    expect(status).toBe(404);
  });

  test.each([
    ["no next steps", { nextSteps: [] }],
    ["a blank next step", { nextSteps: ["   "] }],
    ["11 next steps", { nextSteps: Array(11).fill("Step") }],
    ["an issue over 300 characters", { issue: "x".repeat(301) }],
    ["an unknown source", { source: "MODEL" }],
  ])("rejects %s with 400", async (_label, change) => {
    const caseId = await firstCaseId(VIN.marcus);
    const { status } = await call(`/cases/${caseId}/notes`, {
      method: "POST",
      json: { ...note, vin: VIN.marcus, ...change },
    });
    expect(status).toBe(400);
  });
});
