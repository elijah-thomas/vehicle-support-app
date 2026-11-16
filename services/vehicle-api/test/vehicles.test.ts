import { describe, expect, test } from "vitest";
import { call, useApi, VIN } from "./api.js";

useApi();

describe("GET /vehicles/:vin", () => {
  test("returns specs, recalls, and the owner, in the shape the web app reads", async () => {
    const { status, body } = await call(`/vehicles/${VIN.marcus}`);
    expect(status).toBe(200);
    expect(body.model).toMatchObject({ year: 2023, model: "Kestrel 1500", powertrain: "GAS" });
    expect(body.recalls).toEqual([
      expect.objectContaining({ status: "OPEN", recall: expect.objectContaining({ campaignNumber: "MR-24-117" }) }),
    ]);
    expect(body.customer).toMatchObject({ firstName: "Marcus", email: "marcus.bell@example.com" });
  });

  test("never returns the customer's phone number", async () => {
    const { body } = await call(`/vehicles/${VIN.marcus}`);
    expect(body.customer).not.toHaveProperty("phone");
    expect(JSON.stringify(body)).not.toContain("555-0102");
  });

  test("accepts a lowercase VIN", async () => {
    expect((await call(`/vehicles/${VIN.dana.toLowerCase()}`)).status).toBe(200);
  });

  test.each([
    ["too short", "0MRAE4LR5RA10000"],
    ["contains O", "0MRAE4LR5RA10000O"],
    ["contains I", "IMRAE4LR5RA100001"],
    ["path tricks", "..%2F..%2Fcustomers"],
  ])("rejects a malformed VIN (%s) with 400", async (_label, vin) => {
    const { status, body } = await call(`/vehicles/${vin}`);
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });

  test("returns 404 for a well-formed VIN that doesn't exist", async () => {
    const { status, body } = await call("/vehicles/0MRAE4LR5RA999999");
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });
});

describe("GET /vehicles/:vin/telematics", () => {
  test("returns events newest first", async () => {
    const { body } = await call(`/vehicles/${VIN.dana}/telematics`);
    const times = body.map((e: { recordedAt: string }) => Date.parse(e.recordedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(body.filter((e: { code: string | null }) => e.code === "P0C73")).toHaveLength(3);
  });

  test("respects the limit", async () => {
    const { body } = await call(`/vehicles/${VIN.dana}/telematics?limit=2`);
    expect(body).toHaveLength(2);
  });

  test.each(["0", "201", "abc", "-1"])("rejects limit=%s with 400", async (limit) => {
    expect((await call(`/vehicles/${VIN.dana}/telematics?limit=${limit}`)).status).toBe(400);
  });

  test("returns 404 for an unknown vehicle rather than an empty list", async () => {
    expect((await call("/vehicles/0MRAE4LR5RA999999/telematics")).status).toBe(404);
  });
});

describe("GET /vehicles/:vin/cases", () => {
  test("returns cases newest first, with their notes", async () => {
    const { body } = await call(`/vehicles/${VIN.dana}/cases`);
    expect(body.map((c: { subject: string }) => c.subject)).toEqual([
      "Reduced power warning on highway",
      "Battery warning light returned",
      "Warning light, reduced charging speed",
    ]);
    expect(body[0]).toHaveProperty("notes");
  });

  test("returns an empty list for a vehicle with no cases", async () => {
    const { status, body } = await call(`/vehicles/${VIN.priya}/cases`);
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
