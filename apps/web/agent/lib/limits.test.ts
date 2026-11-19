import { describe, expect, test } from "vitest";
import { MAX_TEXT_LENGTH } from "@/lib/ai/agent-request";
import { overStepCap, questionTooLong } from "./limits";

describe("questionTooLong", () => {
  test("allows a question at the limit", () => {
    expect(questionTooLong([{ kind: "text", text: "a".repeat(MAX_TEXT_LENGTH) }])).toBe(false);
  });
  test("counts every text part together", () => {
    const half = "a".repeat(MAX_TEXT_LENGTH / 2 + 1);
    expect(questionTooLong([{ kind: "text", text: half }, { kind: "file" }, { kind: "text", text: half }])).toBe(true);
  });
});

describe("overStepCap", () => {
  test("allows three model calls in a turn and stops the fourth", () => {
    expect(overStepCap(3)).toBe(false);
    expect(overStepCap(4)).toBe(true);
  });
});
