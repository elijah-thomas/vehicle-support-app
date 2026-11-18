import { expect, test } from "vitest";
import { toBlocks } from "./agent-answer-blocks";

test("splits the summary, bullets, and next steps", () => {
  expect(toBlocks("Recurring fault.\n- P0C73 three times\n- Pump replaced\n\nNext steps:\n- Escalate\n- Call back")).toEqual([
    { kind: "paragraph", text: "Recurring fault." },
    { kind: "list", items: ["P0C73 three times", "Pump replaced"] },
    { kind: "next-steps", items: ["Escalate", "Call back"] },
  ]);
});

test("handles next steps written inline", () => {
  expect(toBlocks("All clear.\nNext steps: Ask what prompted the call.")).toEqual([
    { kind: "paragraph", text: "All clear." },
    { kind: "next-steps", items: ["Ask what prompted the call."] },
  ]);
});

test("renders a half-streamed answer without losing text", () => {
  expect(toBlocks("Recurring fault.\n- P0C7")).toEqual([
    { kind: "paragraph", text: "Recurring fault." },
    { kind: "list", items: ["P0C7"] },
  ]);
});

test("accepts other bullet markers and ignores blank lines", () => {
  expect(toBlocks("\n\n• one\n* two\n\n")).toEqual([{ kind: "list", items: ["one", "two"] }]);
});

test("returns nothing for an empty answer", () => {
  expect(toBlocks("")).toEqual([]);
});
