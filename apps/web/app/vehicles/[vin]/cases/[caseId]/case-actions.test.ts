import { beforeEach, expect, test, vi } from "vitest";
import { VehicleApiError } from "@/lib/customer/vehicle-api";

const addCaseNote = vi.fn();
const closeCase = vi.fn();
const updateTag = vi.fn();
vi.mock("@/lib/customer/cases", () => ({ addCaseNote, closeCase }));
vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@/lib/customer/vehicle-api", async () => {
  class VehicleApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }
  return { VehicleApiError };
});

const { addRepNoteAction, closeCaseAction } = await import("./case-actions");

const VIN = "0MRAE4LR5RA100001";
const note = { vin: VIN, caseId: "case-1", issue: "Status call", summary: "Dana called for an update.", nextSteps: ["Call back Friday"] };

beforeEach(() => {
  vi.clearAllMocks();
  addCaseNote.mockResolvedValue({ id: "note-1" });
  closeCase.mockResolvedValue({ id: "case-1" });
});

test("saves a rep note to the case and refreshes the case list", async () => {
  expect(await addRepNoteAction(note)).toEqual({ ok: true });
  expect(addCaseNote).toHaveBeenCalledWith("case-1", expect.objectContaining({ vin: VIN, source: "REP" }));
  expect(updateTag).toHaveBeenCalledWith(`cases:${VIN}`);
});

test("names the field to fix before calling the case system", async () => {
  expect(await addRepNoteAction({ ...note, nextSteps: [] })).toEqual({ ok: false, error: "Add at least one next step" });
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
