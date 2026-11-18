import { beforeEach, expect, test, vi } from "vitest";
import { loadAgentChat, storeAgentChat, type StoredAgentChat } from "./agent-chat-history";

// The thread lives in sessionStorage, which a browser setting can block or a rep can corrupt.
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

const thread = {
  messages: [
    { id: "u1", role: "user", parts: [{ type: "text", text: "Why is the camera blacking out?" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "tool-getTelematics", toolCallId: "t1", state: "output-available", input: {}, output: {} },
        { type: "text", text: "Fault B1A52 recurred on Nov 12." },
      ],
    },
  ],
  pending: false,
} as unknown as StoredAgentChat;

test("a thread comes back after a reload, tool steps included", () => {
  storeAgentChat(VIN, thread);
  expect(loadAgentChat(VIN)).toEqual(thread);
});

test("each vehicle keeps its own thread", () => {
  storeAgentChat(VIN, thread);
  expect(loadAgentChat(OTHER_VIN)).toBeNull();
});

test("a question sent but not answered comes back as pending", () => {
  const asked = { messages: thread.messages.slice(0, 1), pending: true };
  storeAgentChat(VIN, asked);
  expect(loadAgentChat(VIN)).toEqual(asked);
});

test("an empty thread removes the entry", () => {
  storeAgentChat(VIN, thread);
  storeAgentChat(VIN, { messages: [], pending: false });
  expect(store).toEqual({});
});

test("blocked storage means no restore, not an error", () => {
  blocked = true;
  expect(() => storeAgentChat(VIN, thread)).not.toThrow();
  expect(loadAgentChat(VIN)).toBeNull();
});

test("a corrupt entry is ignored", () => {
  store[`vs:agent-chat:${VIN}`] = "{not json";
  expect(loadAgentChat(VIN)).toBeNull();
});

test("an entry the route would refuse is ignored", () => {
  const forged = {
    messages: [{ id: "u1", role: "user", parts: [{ type: "file", url: "https://example.com/x.pdf" }] }],
    pending: true,
  };
  store[`vs:agent-chat:${VIN}`] = JSON.stringify(forged);
  expect(loadAgentChat(VIN)).toBeNull();
});

test("messages without an ID are ignored", () => {
  const noId = { messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }], pending: false };
  store[`vs:agent-chat:${VIN}`] = JSON.stringify(noId);
  expect(loadAgentChat(VIN)).toBeNull();
});
