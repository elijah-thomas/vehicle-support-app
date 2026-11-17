import { beforeEach, describe, expect, test, vi } from "vitest";
import { VehicleApiError } from "@/lib/customer/vehicle-api";

const addCaseNote = vi.fn();
const closeCase = vi.fn();
const createCaseWithNote = vi.fn();
const reopenCase = vi.fn();
const removeNote = vi.fn();
const restoreNote = vi.fn();
const updateTag = vi.fn();
const redirect = vi.fn();
vi.mock("@/lib/customer/cases", () => ({ addCaseNote, closeCase, createCaseWithNote, reopenCase, removeNote, restoreNote }));
vi.mock("next/cache", () => ({ updateTag }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/customer/vehicle-api", async () => {
  class VehicleApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }
  return { VehicleApiError };
});

const { addRepNoteAction, closeCaseAction, openCaseAction, removeNoteAction, reopenCaseAction, restoreNoteAction } =
  await import("./case-actions");

const VIN = "0MRAE4LR5RA100001";
const note = { vin: VIN, caseId: "case-1", summary: "Dana called for an update." };

beforeEach(() => {
  vi.clearAllMocks();
  addCaseNote.mockResolvedValue({ id: "note-1" });
  closeCase.mockResolvedValue({ id: "case-1" });
});

test("saves a rep note to the case and refreshes the case list", async () => {
  expect(await addRepNoteAction(note)).toEqual({ ok: true });
  expect(addCaseNote).toHaveBeenCalledWith("case-1", { vin: VIN, source: "REP", summary: "Dana called for an update." });
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

test("names the field to fix before calling the case system", async () => {
  expect(await addRepNoteAction({ ...note, summary: " " })).toEqual({ ok: false, error: "Note can't be empty" });
  expect(await closeCaseAction({ vin: VIN, caseId: "case-1", resolution: "  " })).toEqual({
    ok: false,
    error: "Resolution can't be empty",
  });
  expect(addCaseNote).not.toHaveBeenCalled();
  expect(closeCase).not.toHaveBeenCalled();
});

test("closes the case with its resolution", async () => {
  expect(await closeCaseAction({ vin: VIN, caseId: "case-1", resolution: "Pump replaced." })).toEqual({ ok: true });
  expect(closeCase).toHaveBeenCalledWith("case-1", { vin: VIN, resolution: "Pump replaced." });
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

test("a case closed elsewhere refreshes the page and says so", async () => {
  closeCase.mockRejectedValue(new VehicleApiError(409, "conflict", "already closed"));
  const result = await closeCaseAction({ vin: VIN, caseId: "case-1", resolution: "Pump replaced." });
  expect(result).toEqual({ ok: false, error: expect.stringContaining("already closed") });
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

test("a failed close leaves the cache alone", async () => {
  closeCase.mockRejectedValue(new Error("network"));
  expect(await closeCaseAction({ vin: VIN, caseId: "case-1", resolution: "Pump replaced." })).toEqual({
    ok: false,
    error: "Couldn't reach the case system. Try again in a moment.",
  });
  expect(updateTag).not.toHaveBeenCalled();
});

test("reopens the case with the rep's reason", async () => {
  reopenCase.mockResolvedValue({ id: "case-1" });
  expect(await reopenCaseAction({ vin: VIN, caseId: "case-1", reason: "Light came back." })).toEqual({ ok: true });
  expect(reopenCase).toHaveBeenCalledWith("case-1", { vin: VIN, reason: "Light came back." });
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
  expect(await reopenCaseAction({ vin: VIN, caseId: "case-1", reason: "" })).toEqual({ ok: false, error: "Reason can't be empty" });
});

test("removes and restores a note, refreshing the case list each time", async () => {
  removeNote.mockResolvedValue({ id: "note-1" });
  restoreNote.mockResolvedValue({ id: "note-1" });
  const target = { vin: VIN, caseId: "case-1", noteId: "note-1" };
  expect(await removeNoteAction(target)).toEqual({ ok: true });
  expect(removeNote).toHaveBeenCalledWith("case-1", "note-1", VIN);
  expect(await restoreNoteAction(target)).toEqual({ ok: true });
  expect(restoreNote).toHaveBeenCalledWith("case-1", "note-1", VIN);
  expect(updateTag).toHaveBeenCalledTimes(2);
});

test("a failed removal reports the case system's error and leaves the cache alone", async () => {
  removeNote.mockRejectedValue(new VehicleApiError(404, "not_found", "no note"));
  const result = await removeNoteAction({ vin: VIN, caseId: "case-1", noteId: "note-1" });
  expect(result).toEqual({ ok: false, error: "This case isn't on this vehicle in the case system. Reload the page." });
  expect(updateTag).not.toHaveBeenCalled();
});

describe("openCaseAction", () => {
  const newCase = { vin: VIN, subject: "Wipers stall", category: "Electrical", reported: "Wipers stop mid-sweep." };

  test("opens the case with what the customer reported as its first rep note, then goes to it", async () => {
    createCaseWithNote.mockResolvedValue({ caseId: "case-9", caseNumber: 24120, noteId: "note-9" });
    await openCaseAction(newCase);
    expect(createCaseWithNote).toHaveBeenCalledWith({
      vin: VIN,
      subject: "Wipers stall",
      category: "Electrical",
      description: "Wipers stop mid-sweep.",
      note: { source: "REP", summary: "Wipers stop mid-sweep." },
    });
    expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
    expect(redirect).toHaveBeenCalledWith(`/vehicles/${VIN}/cases/24120`);
  });

  test("names the empty field and writes nothing", async () => {
    expect(await openCaseAction({ ...newCase, reported: "  " })).toEqual({
      ok: false,
      error: "What the customer reported can't be empty",
    });
    expect(createCaseWithNote).not.toHaveBeenCalled();
  });

  test("keeps the rep on the form when the case system fails", async () => {
    createCaseWithNote.mockRejectedValue(new VehicleApiError(429, "rate_limited", "Slow down"));
    const result = await openCaseAction(newCase);
    expect(result).toMatchObject({ ok: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
