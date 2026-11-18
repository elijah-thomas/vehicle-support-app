import { beforeEach, expect, test, vi } from "vitest";
import { loadAssistantEngine, storeAssistantEngine } from "./assistant-engine";
import { loadEveSession, storeEveSession } from "./eve-chat-session";

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

test("keeps one conversation ID per vehicle", () => {
  storeEveSession(VIN, "wrun_A");
  storeEveSession(OTHER_VIN, "wrun_B");
  expect(loadEveSession(VIN)).toBe("wrun_A");
  expect(loadEveSession(OTHER_VIN)).toBe("wrun_B");
});

test("New chat forgets the conversation", () => {
  storeEveSession(VIN, "wrun_A");
  storeEveSession(VIN, null);
  expect(loadEveSession(VIN)).toBeNull();
  expect(store).toEqual({});
});

test("blocked storage starts a new conversation and never throws", () => {
  blocked = true;
  expect(() => storeEveSession(VIN, "wrun_A")).not.toThrow();
  expect(loadEveSession(VIN)).toBeNull();
});

test("the AI SDK version is the default, and only known engines are restored", () => {
  expect(loadAssistantEngine()).toBe("ai-sdk");
  storeAssistantEngine("eve");
  expect(loadAssistantEngine()).toBe("eve");
  store["vs:assistant-engine"] = "something-else";
  expect(loadAssistantEngine()).toBe("ai-sdk");
});
