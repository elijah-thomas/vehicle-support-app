import { beforeEach, expect, test, vi } from "vitest";

const getVehicle = vi.fn();
vi.mock("@/lib/customer/vehicles", () => ({
  getVehicle: (vin: string) => getVehicle(vin),
  getCases: async () => [],
  getTelematics: async () => [],
}));
const streamText = vi.fn();
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), streamText }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://test/api/call-summary", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  getVehicle.mockReset();
  streamText.mockReset();
});

// Every rejection must happen before a model call: that's where the money is.
test.each([
  ["not JSON", "{oops"],
  ["a malformed VIN", { vin: "abc", transcript: "Customer: hi" }],
  ["a whitespace-only transcript", { vin: "0MRKC15V8PA200002", transcript: " \n\t " }],
  ["a transcript over 15,000 characters", { vin: "0MRKC15V8PA200002", transcript: "x".repeat(15_001) }],
])("rejects %s with 400, without calling the model", async (_label, body) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "invalid_request" } });
  expect(streamText).not.toHaveBeenCalled();
});

test("returns 404 for an unknown vehicle, without calling the model", async () => {
  getVehicle.mockResolvedValue(null);
  expect((await post({ vin: "0MRKC15V8PA999999", transcript: "Customer: hi" })).status).toBe(404);
  expect(streamText).not.toHaveBeenCalled();
});
