import { expect, test } from "vitest";
import { call, useApi } from "./api.js";

useApi();

test("finds a customer by email regardless of case, with all their vehicles", async () => {
  const { status, body } = await call("/customers?email=Jordan.Okafor@Example.com");
  expect(status).toBe(200);
  expect(body.vehicles).toHaveLength(2);
});

test("returns 404 for an unknown email", async () => {
  expect((await call("/customers?email=nobody@example.com")).status).toBe(404);
});

test.each(["", "not-an-email", "a@b", "'; DROP TABLE customers;--"])("rejects email %j with 400", async (email) => {
  expect((await call(`/customers?email=${encodeURIComponent(email)}`)).status).toBe(400);
});
