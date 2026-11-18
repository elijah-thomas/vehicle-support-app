import { describe, expect, test } from "vitest";
import { checkVin, lookupInPastedText, normalizeQuery, queryKind } from "./search-query";

describe("queryKind", () => {
  test.each([
    ["", "empty"],
    ["dana@example.com", "email"],
    ["0MRAE4", "vin"],
    ["Dana Whitfield", "text"],
  ])("%j is %s", (query, kind) => expect(queryKind(query)).toBe(kind));
});

describe("normalizeQuery", () => {
  test("uppercases a VIN and drops the spaces and dashes reps paste", () => {
    expect(normalizeQuery("  0mrae-4lr5 ra100001")).toBe("0MRAE4LR5RA100001");
  });
  test("leaves names and emails as typed", () => {
    expect(normalizeQuery(" Dana.Whitfield@Example.com")).toBe("Dana.Whitfield@Example.com");
  });
});

describe("checkVin", () => {
  test.each([
    ["0MRAE4LR5RA10000O", "error", "VIN can't contain O"],
    ["0MRAE4LR5RA10000I", "error", "VIN can't contain I"],
    ["0MRAE4LR5RA1000#1", "error", "VIN uses letters and digits only"],
    ["0MRAE4LR5RA1000011", "error", "VIN is 17 characters"],
    ["0MRAE4LR5RA10000", "neutral", "VIN · 16/17"],
    ["0MRAE4LR5RA100001", "ok", "VIN · Enter to open"],
  ])("%s → %s", (vin, tone, text) => expect(checkVin(vin)).toEqual({ tone, text }));
});

describe("lookupInPastedText", () => {
  test("pulls a VIN out of a pasted note, uppercased", () => {
    expect(lookupInPastedText("VIN: 0mrkc15v8pa200002 called about camera")).toBe("0MRKC15V8PA200002");
  });
  test("prefers the VIN when both are present", () => {
    expect(lookupInPastedText("marcus.bell@example.com, 0MRKC15V8PA200002")).toBe("0MRKC15V8PA200002");
  });
  test("pulls an email out of a signature block", () => {
    expect(lookupInPastedText("Thanks,\nDana <dana.whitfield@example.com>")).toBe("dana.whitfield@example.com");
  });
  test.each(["", "call me back tomorrow", "0MRKC15V8PA20000", "not@email"])("finds nothing in %j", (text) => {
    expect(lookupInPastedText(text)).toBeNull();
  });
});
