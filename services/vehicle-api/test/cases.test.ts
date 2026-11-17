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

  test("opens a case with its first note in one write", async () => {
    const { status, body } = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck, category: "Electrical", subject: "Dash flicker", description: "Flickers.", note },
    });
    expect(status).toBe(201);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]).toMatchObject({ caseId: body.id, issue: "Camera blackouts" });
  });

  test("an invalid first note opens no case", async () => {
    const before = (await call(`/vehicles/${VIN.jordanTruck}/cases`)).body.length;
    const { status } = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck, category: "Electrical", subject: "x", description: "x", note: { ...note, nextSteps: [] } },
    });
    expect(status).toBe(400);
    expect((await call(`/vehicles/${VIN.jordanTruck}/cases`)).body).toHaveLength(before);
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
    const noteCount = async () => (await call(`/vehicles/${VIN.dana}/cases`)).body[0].notes.length as number;
    const before = await noteCount();

    const { status } = await call(`/cases/${danaCase}/notes`, { method: "POST", json: { ...note, vin: VIN.marcus } });
    expect(status).toBe(404);
    expect(await noteCount()).toBe(before);
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

describe("POST /cases/:id/close", () => {
  async function openTruckCase() {
    const { body } = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck, category: "Engine & Emissions", subject: "Coolant warning", description: "P0128 on." },
    });
    return body.id as string;
  }

  test("closes the vehicle's open case with a resolution", async () => {
    const caseId = await openTruckCase();
    const { status, body } = await call(`/cases/${caseId}/close`, {
      method: "POST",
      json: { vin: VIN.jordanTruck, resolution: "Dealer replaced the thermostat." },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "CLOSED", resolution: "Dealer replaced the thermostat." });
    expect(body.closedAt).toEqual(expect.any(String));
  });

  test("refuses to close a case twice", async () => {
    const caseId = await openTruckCase();
    const close = () => call(`/cases/${caseId}/close`, { method: "POST", json: { vin: VIN.jordanTruck, resolution: "Fixed." } });
    expect((await close()).status).toBe(200);
    const { status, body } = await close();
    expect(status).toBe(409);
    expect(body.error.code).toBe("conflict");
  });

  test("refuses a case that belongs to another vehicle, and leaves it open", async () => {
    const caseId = await openTruckCase();
    const { status } = await call(`/cases/${caseId}/close`, { method: "POST", json: { vin: VIN.marcus, resolution: "Fixed." } });
    expect(status).toBe(404);

    const cases = (await call(`/vehicles/${VIN.jordanTruck}/cases`)).body;
    expect(cases.find((c: { id: string }) => c.id === caseId).status).toBe("OPEN");
  });

  test("requires a resolution", async () => {
    const caseId = await openTruckCase();
    const { status } = await call(`/cases/${caseId}/close`, { method: "POST", json: { vin: VIN.jordanTruck, resolution: "  " } });
    expect(status).toBe(400);
  });
});

async function openTruckCaseWithNote() {
  const { body } = await call("/cases", {
    method: "POST",
    json: { vin: VIN.jordanTruck, category: "Electrical", subject: "Wipers stall", description: "Wipers stop mid-sweep.", note },
  });
  return { caseId: body.id as string, noteId: body.notes[0].id as string, number: body.number as number };
}

const truckCase = async (number: number) => (await call(`/vehicles/${VIN.jordanTruck}/cases/${number}`)).body;

describe("rep notes", () => {
  test("a rep's note needs only a summary", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const { status, body } = await call(`/cases/${caseId}/notes`, {
      method: "POST",
      json: { vin: VIN.marcus, source: "REP", summary: "Left a voicemail." },
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({ source: "REP", issue: null, summary: "Left a voicemail.", nextSteps: [] });
  });

  test("an AI-drafted note still needs an issue", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const { issue: _issue, ...withoutIssue } = note;
    const { status } = await call(`/cases/${caseId}/notes`, { method: "POST", json: { ...withoutIssue, vin: VIN.marcus } });
    expect(status).toBe(400);
  });
});

describe("a draft is saved once (D46)", () => {
  const notesOn = async (vin: string, caseId: string) =>
    ((await call(`/vehicles/${vin}/cases`)).body as { id: string; notes: unknown[] }[]).find((c) => c.id === caseId)!.notes.length;
  const caseCount = async (vin: string) => (await call(`/vehicles/${vin}/cases`)).body.length as number;

  test("a repeated note save answers with the first note and writes nothing", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const json = { ...note, vin: VIN.marcus, draftId: crypto.randomUUID() };
    const first = await call(`/cases/${caseId}/notes`, { method: "POST", json });
    const before = await notesOn(VIN.marcus, caseId);

    const repeat = await call(`/cases/${caseId}/notes`, { method: "POST", json: { ...json, summary: "Edited later." } });
    expect(repeat.status).toBe(200);
    expect(repeat.body).toMatchObject({ id: first.body.id, summary: "Customer called." });
    expect(await notesOn(VIN.marcus, caseId)).toBe(before);
  });

  test("two saves racing write one note", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const json = { ...note, vin: VIN.marcus, draftId: crypto.randomUUID() };
    const responses = await Promise.all([1, 2, 3].map(() => call(`/cases/${caseId}/notes`, { method: "POST", json })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
  });

  test("a repeated new-case save answers with the case it opened, without opening another", async () => {
    const json = { vin: VIN.jordanTruck, category: "Electrical", subject: "Horn", description: "Quiet.", note: { ...note, draftId: crypto.randomUUID() } };
    const first = await call("/cases", { method: "POST", json });
    const before = await caseCount(VIN.jordanTruck);

    const repeat = await call("/cases", { method: "POST", json });
    expect(repeat.status).toBe(200);
    expect(repeat.body).toMatchObject({ id: first.body.id, number: first.body.number, notes: [{ id: first.body.notes[0].id }] });
    expect(await caseCount(VIN.jordanTruck)).toBe(before);
  });

  test("refuses the draft on a different target than the one it was saved to", async () => {
    const [caseId, otherCaseId] = ((await call(`/vehicles/${VIN.jordanTruck}/cases`)).body as { id: string }[]).map((c) => c.id);
    const draftId = crypto.randomUUID();
    await call(`/cases/${caseId}/notes`, { method: "POST", json: { ...note, vin: VIN.jordanTruck, draftId } });
    const before = await caseCount(VIN.jordanTruck);

    const toOtherCase = await call(`/cases/${otherCaseId}/notes`, { method: "POST", json: { ...note, vin: VIN.jordanTruck, draftId } });
    const toNewCase = await call("/cases", {
      method: "POST",
      json: { vin: VIN.jordanTruck, category: "x", subject: "x", description: "x", note: { ...note, draftId } },
    });
    expect([toOtherCase.status, toNewCase.status]).toEqual([409, 409]);
    expect(await caseCount(VIN.jordanTruck)).toBe(before);
  });

  test("notes without a draft ID are written every time, as before", async () => {
    const caseId = await firstCaseId(VIN.marcus);
    const json = { ...note, vin: VIN.marcus };
    const statuses = [(await call(`/cases/${caseId}/notes`, { method: "POST", json })).status, (await call(`/cases/${caseId}/notes`, { method: "POST", json })).status];
    expect(statuses).toEqual([201, 201]);
  });
});

describe("POST /cases/:id/reopen", () => {
  async function closedTruckCase() {
    const { caseId, number } = await openTruckCaseWithNote();
    await call(`/cases/${caseId}/close`, { method: "POST", json: { vin: VIN.jordanTruck, resolution: "Dealer adjusted the linkage." } });
    return { caseId, number };
  }

  test("reopens a closed case and keeps the reason and old resolution as a rep note", async () => {
    const { caseId, number } = await closedTruckCase();
    const { status, body } = await call(`/cases/${caseId}/reopen`, {
      method: "POST",
      json: { vin: VIN.jordanTruck, reason: "Wipers stalled again this morning." },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "OPEN", closedAt: null, resolution: null, number });
    expect(body.notes[0]).toMatchObject({
      source: "REP",
      issue: "Case reopened",
      summary: "Wipers stalled again this morning.\n\nPrevious resolution: Dealer adjusted the linkage.",
    });
  });

  test("refuses to reopen an open case", async () => {
    const { caseId } = await openTruckCaseWithNote();
    const { status } = await call(`/cases/${caseId}/reopen`, { method: "POST", json: { vin: VIN.jordanTruck, reason: "Again." } });
    expect(status).toBe(409);
  });

  test("refuses another vehicle's case, and leaves it closed", async () => {
    const { caseId, number } = await closedTruckCase();
    const { status } = await call(`/cases/${caseId}/reopen`, { method: "POST", json: { vin: VIN.marcus, reason: "Again." } });
    expect(status).toBe(404);
    expect((await truckCase(number)).status).toBe("CLOSED");
  });

  test("requires a reason", async () => {
    const { caseId } = await closedTruckCase();
    const { status } = await call(`/cases/${caseId}/reopen`, { method: "POST", json: { vin: VIN.jordanTruck, reason: " " } });
    expect(status).toBe(400);
  });
});

describe("removing and restoring a note", () => {
  const act = (action: "remove" | "restore", caseId: string, noteId: string, vin = VIN.jordanTruck) =>
    call(`/cases/${caseId}/notes/${noteId}/${action}`, { method: "POST", json: { vin } });

  test("a removed note leaves case reads, and restore brings it back unchanged", async () => {
    const { caseId, noteId, number } = await openTruckCaseWithNote();

    const removed = await act("remove", caseId, noteId);
    expect(removed.status).toBe(200);
    expect(removed.body.removedAt).toEqual(expect.any(String));
    expect((await truckCase(number)).notes).toEqual([]);
    const list = (await call(`/vehicles/${VIN.jordanTruck}/cases`)).body;
    expect(list.find((c: { id: string }) => c.id === caseId).notes).toEqual([]);

    const restored = await act("restore", caseId, noteId);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ id: noteId, removedAt: null, issue: "Camera blackouts" });
    expect((await truckCase(number)).notes.map((n: { id: string }) => n.id)).toEqual([noteId]);
  });

  test("refuses to remove a note twice, or restore one that isn't removed", async () => {
    const { caseId, noteId } = await openTruckCaseWithNote();
    expect((await act("restore", caseId, noteId)).status).toBe(409);
    expect((await act("remove", caseId, noteId)).status).toBe(200);
    expect((await act("remove", caseId, noteId)).status).toBe(409);
  });

  test("refuses another vehicle's note, and leaves it in place", async () => {
    const { caseId, noteId, number } = await openTruckCaseWithNote();
    expect((await act("remove", caseId, noteId, VIN.marcus)).status).toBe(404);
    expect((await truckCase(number)).notes).toHaveLength(1);
  });

  test("refuses a note that isn't on the named case", async () => {
    const { noteId } = await openTruckCaseWithNote();
    const other = await openTruckCaseWithNote();
    expect((await act("remove", other.caseId, noteId)).status).toBe(404);
  });
});
