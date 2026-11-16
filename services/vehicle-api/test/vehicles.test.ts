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

  test("lists the owner's vehicles, so a rep can reach the other one", async () => {
    const { body } = await call(`/vehicles/${VIN.jordanTruck}`);
    expect(body.customer.vehicles.map((v: { vin: string }) => v.vin)).toEqual(
      expect.arrayContaining([VIN.jordanTruck, "0MRAE4SR2NA400004"]),
    );
    expect(body.customer.vehicles[0]).toEqual({ vin: expect.any(String), model: expect.objectContaining({ model: expect.any(String) }) });
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

  test("returns only events inside from/to, inclusive", async () => {
    const all = (await call(`/vehicles/${VIN.dana}/telematics`)).body as { id: string; recordedAt: string }[];
    const [newest, middle, oldest] = [all[0]!, all[Math.floor(all.length / 2)]!, all.at(-1)!];
    const { body } = await call(`/vehicles/${VIN.dana}/telematics?from=${oldest.recordedAt}&to=${middle.recordedAt}`);
    const ids = body.map((e: { id: string }) => e.id);
    expect(ids).toContain(oldest.id);
    expect(ids).toContain(middle.id);
    expect(ids).not.toContain(newest.id);
  });

  test.each([
    ["from=yesterday", "a date that isn't ISO 8601"],
    ["from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z", "from after to"],
  ])("rejects %s with 400 (%s)", async (query) => {
    expect((await call(`/vehicles/${VIN.dana}/telematics?${query}`)).status).toBe(400);
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
