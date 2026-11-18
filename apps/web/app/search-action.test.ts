import { beforeEach, expect, test, vi } from "vitest";

const findCustomerByEmail = vi.fn();
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
vi.mock("@/lib/customer/reads", () => ({ findCustomerByEmail }));
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow: () => {} }));

const { searchAction } = await import("./search-action");
const search = (query: string) => {
  const form = new FormData();
  form.set("query", query);
  return searchAction({}, form);
};

beforeEach(() => vi.clearAllMocks());

test("a VIN goes straight to its page, uppercased", async () => {
  await expect(search(" 0mrkc15v8pa200002 ")).rejects.toMatchObject({ url: "/vehicles/0MRKC15V8PA200002" });
  expect(findCustomerByEmail).not.toHaveBeenCalled();
});

test("anything that isn't a VIN or an email is explained, not looked up", async () => {
  expect(await search("Dana")).toEqual({ error: "Enter a 17-character VIN or a customer email address." });
  expect(findCustomerByEmail).not.toHaveBeenCalled();
});

test("an unknown email says so", async () => {
  findCustomerByEmail.mockResolvedValue(null);
  expect(await search("nobody@example.com")).toEqual({ error: "No customer found with that email." });
});

test("the customer system being down is an inline message, not a crashed page", async () => {
  findCustomerByEmail.mockRejectedValue(new TypeError("fetch failed"));
  expect(await search("dana.whitfield@example.com")).toEqual({
    error: "Couldn't reach the customer system. Try again in a moment.",
  });
});

test("a customer with two vehicles gets a choice", async () => {
  findCustomerByEmail.mockResolvedValue({
    firstName: "Jordan",
    lastName: "Okafor",
    vehicles: [
      { vin: "0MRAE4SR2NA400004", color: "Ember Red", model: { year: 2022, make: "Meridian", model: "Aster EV", trim: "Standard" } },
      { vin: "0MRKW15T6MA400005", color: "Summit White", model: { year: 2021, make: "Meridian", model: "Kestrel 1500", trim: "Work Truck" } },
    ],
  });
  const state = await search("jordan.okafor@example.com");
  expect(state.customer?.vehicles.map((v) => v.vin)).toEqual(["0MRAE4SR2NA400004", "0MRKW15T6MA400005"]);
});
