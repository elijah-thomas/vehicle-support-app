import { beforeEach, expect, test, vi } from "vitest";
import { clearCallSummary, loadCallSummary, newDraft, storeCallSummary } from "./call-summary-draft";

// The unsaved draft lives in sessionStorage, which a browser setting can block or a rep can corrupt.
let store: Record<string, string>;
let blocked: boolean;

beforeEach(() => {
  store = {};
  blocked = false;
  const sessionStorage = {
    getItem: (key: string) => {
      if (blocked) throw new Error("SecurityError");
      return store[key] ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("QuotaExceededError");
      store[key] = value;
    },
    removeItem: (key: string) => delete store[key],
  };
  vi.stubGlobal("window", { sessionStorage });
});

const VIN = "0MRKC15V8PA200002";
const OTHER_VIN = "0MRAE4LR5RA100001";
const generated = {
  callType: "vehicle_issue" as const,
  issue: "Camera blackouts",
  summary: "Customer called.",
  nextSteps: ["Book recall", "Call back"],
  suggestedCase: { subject: "Camera", category: "Electrical" },
};

test("a draft and the rep's edits come back after a reload, with the same ID", () => {
  const draft = newDraft(generated);
  const edited = { ...draft, edits: { ...draft.edits, summary: "Edited by the rep.", caseId: "new" } };
  storeCallSummary(VIN, { transcript: "Hello?", draft: edited });

  expect(loadCallSummary(VIN)).toEqual({ transcript: "Hello?", draft: edited });
});

test("a new draft gets a fresh ID and starts from the model's output", () => {
  const [a, b] = [newDraft(generated), newDraft(generated)];
  expect(a.id).not.toBe(b.id);
  expect(a.edits).toEqual({
    caseId: null,
    issue: "Camera blackouts",
    summary: "Customer called.",
    nextSteps: "Book recall\nCall back",
    subject: "Camera",
    category: "Electrical",
  });
});

test("each vehicle keeps its own draft", () => {
  storeCallSummary(VIN, { transcript: "First call", draft: null });
  storeCallSummary(OTHER_VIN, { transcript: "Second call", draft: null });
  expect(loadCallSummary(VIN)?.transcript).toBe("First call");
  expect(loadCallSummary(OTHER_VIN)?.transcript).toBe("Second call");
});

test("clearing after a save leaves nothing behind", () => {
  storeCallSummary(VIN, { transcript: "Hello?", draft: newDraft(generated) });
  clearCallSummary(VIN);
  expect(store).toEqual({});
  expect(loadCallSummary(VIN)).toBeNull();
});

test.each([
  ["not JSON", "{oops"],
  ["the wrong shape", '{"transcript":1}'],
  ["a draft without a valid ID", JSON.stringify({ transcript: "x", draft: { ...newDraft(generated), id: "nope" } })],
])("an entry that is %s is ignored", (_label, raw) => {
  store[`vs:call-summary:${VIN}`] = raw;
  expect(loadCallSummary(VIN)).toBeNull();
});

test("blocked storage doesn't break the form", () => {
  blocked = true;
  expect(() => storeCallSummary(VIN, { transcript: "Hello?", draft: null })).not.toThrow();
  expect(loadCallSummary(VIN)).toBeNull();
});
