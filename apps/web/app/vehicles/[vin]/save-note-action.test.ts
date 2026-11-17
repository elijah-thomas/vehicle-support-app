import { beforeEach, describe, expect, test, vi } from "vitest";
import { VehicleApiError } from "@/lib/customer/vehicle-api";

const createCaseWithNote = vi.fn();
const addCaseNote = vi.fn();
const updateTag = vi.fn();
vi.mock("@/lib/customer/cases", () => ({ createCaseWithNote, addCaseNote }));
vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@/lib/customer/vehicle-api", async () => {
  class VehicleApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }
  return { VehicleApiError };
});

const { saveNoteAction } = await import("./save-note-action");

const VIN = "0MRKC15V8PA200002";
const note = { vin: VIN, caseId: "case-1", issue: "Camera blackouts", summary: "Customer called.", nextSteps: ["Book recall"] };

beforeEach(() => {
  vi.clearAllMocks();
  createCaseWithNote.mockResolvedValue({ caseId: "new-case", caseNumber: 24120, noteId: "note-2" });
  addCaseNote.mockResolvedValue({ id: "note-1" });
});

test("saves to an existing case, sends the VIN, and refreshes Case history", async () => {
  expect(await saveNoteAction(note)).toEqual({ ok: true, noteId: "note-1", caseId: "case-1" });
  expect(addCaseNote).toHaveBeenCalledWith("case-1", expect.objectContaining({ vin: VIN, source: "AI_DRAFT_EDITED" }));
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

test("opens a new case with its note in one call", async () => {
  const result = await saveNoteAction({ ...note, caseId: "new", newCase: { subject: "Camera", category: "Electrical" } });
  expect(result).toEqual({ ok: true, noteId: "note-2", caseId: "new-case", caseNumber: 24120 });
  expect(createCaseWithNote).toHaveBeenCalledWith(
    expect.objectContaining({ vin: VIN, subject: "Camera", description: "Customer called.", note: expect.objectContaining({ issue: "Camera blackouts" }) }),
  );
  expect(addCaseNote).not.toHaveBeenCalled();
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

describe("tells the rep what to fix, without calling the case system", () => {
  test.each([
    ["an empty issue", { issue: "  " }, "Issue can't be empty"],
    ["an issue over 300 characters", { issue: "x".repeat(301) }, "Issue is too long: 300 characters max"],
    ["no next steps", { nextSteps: [] }, "Add at least one next step"],
    ["11 next steps", { nextSteps: Array(11).fill("Step") }, "Keep it to 10 next steps or fewer"],
    ["a new case without a subject", { caseId: "new" }, "A new case needs a subject and category"],
  ])("%s", async (_label, change, error) => {
    expect(await saveNoteAction({ ...note, ...change })).toEqual({ ok: false, error });
    expect(addCaseNote).not.toHaveBeenCalled();
  });
});

describe("explains case-system failures", () => {
  test.each([
    [new VehicleApiError(404, "not_found", "x"), "That case isn't on this vehicle"],
    [new VehicleApiError(400, "invalid_request", "Too long"), "didn't accept the note: Too long"],
    [new VehicleApiError(429, "rate_limited", "x"), "busy"],
    [new VehicleApiError(503, "unavailable", "x"), "didn't respond"],
    [new TypeError("fetch failed"), "Couldn't reach the case system"],
  ])("%s", async (error, message) => {
    addCaseNote.mockRejectedValue(error);
    const result = await saveNoteAction(note);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
    expect(updateTag).not.toHaveBeenCalled();
  });
});

test("a failed new case leaves nothing to clean up: the retry sends the whole save again", async () => {
  createCaseWithNote.mockRejectedValue(new VehicleApiError(503, "unavailable", "x"));
  const result = await saveNoteAction({ ...note, caseId: "new", newCase: { subject: "Camera", category: "Electrical" } });
  expect(result).toEqual({ ok: false, error: expect.stringContaining("didn't respond") });
  expect(updateTag).not.toHaveBeenCalled();
});
