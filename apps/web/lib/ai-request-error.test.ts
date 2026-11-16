import { expect, test } from "vitest";
import { aiErrorCode, rateLimitAwareFetch } from "./ai-request-error";

const withStatus = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

test.each([
  ["a Firewall 429, whatever its body", withStatus("<html>Too Many Requests</html>", 429), "rate_limited"],
  ["our too_long code", new Error('{"error":{"code":"too_long"}}'), "too_long"],
  ["our not_found code", new Error('{"error":{"code":"not_found"}}'), "not_found"],
  ["a code we don't know", new Error('{"error":{"code":"teapot"}}'), "failed"],
  ["a mid-stream agent failure", new Error('{"error":{"code":"agent_failed"}}'), "failed"],
  ["a network error", new TypeError("Failed to fetch"), "failed"],
])("%s → %s", (_label, error, code) => expect(aiErrorCode(error)).toBe(code));

test("the call summary's fetch turns a Firewall 429 into our error shape", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>Too Many Requests</html>", { status: 429 });
  try {
    const response = await rateLimitAwareFetch("http://test/api/call-summary");
    expect(aiErrorCode(new Error(await response.text()))).toBe("rate_limited");
  } finally {
    globalThis.fetch = original;
  }
});
