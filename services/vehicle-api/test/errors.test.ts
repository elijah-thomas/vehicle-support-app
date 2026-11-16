import { expect, test } from "vitest";
import { call, useApi } from "./api.js";

useApi();

test("malformed JSON is a 400, not a server error", async () => {
  const { status, body } = await call("/cases", { method: "POST", body: '{"vin": ' });
  expect(status).toBe(400);
  expect(body.error.code).toBe("invalid_json");
});

test("a body over 100kb is a 413", async () => {
  const { status, body } = await call("/cases", { method: "POST", json: { description: "x".repeat(200_000) } });
  expect(status).toBe(413);
  expect(body.error.code).toBe("too_large");
});

test("unknown routes keep the error shape", async () => {
  const { status, body } = await call("/admin");
  expect(status).toBe(404);
  expect(body).toEqual({ error: { code: "not_found", message: expect.any(String) } });
});
