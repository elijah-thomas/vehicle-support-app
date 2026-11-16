import { beforeEach, expect, test, vi } from "vitest";
import { clearRecentVehicles, getRecentVehicles, recordRecentVehicle } from "./recent-vehicles";

// Recents live in localStorage, which a rep (or a browser setting) can corrupt or block.
let store: Record<string, string>;
let blocked: boolean;

beforeEach(() => {
  store = {};
  blocked = false;
  const localStorage = {
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
  vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage }));
});

const vehicle = (n: number) => ({ vin: `0MRAE4LR5RA10000${n}`, name: `Vehicle ${n}`, owner: "Owner" });

test("keeps the five most recent, newest first, without duplicates", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 2]) recordRecentVehicle(vehicle(n));
  expect(getRecentVehicles().map((v) => v.name)).toEqual(["Vehicle 2", "Vehicle 6", "Vehicle 5", "Vehicle 4", "Vehicle 3"]);
});

test("stores no email", () => {
  recordRecentVehicle(vehicle(1));
  expect(store["vs:recent"]).not.toContain("@");
});

test.each([
  ["not JSON", "{oops"],
  ["not a list", '{"vin":"x"}'],
  ["entries of the wrong shape", '[{"vin":1},null,"x"]'],
])("ignores corrupt storage (%s)", (_label, raw) => {
  store["vs:recent"] = raw;
  expect(getRecentVehicles()).toEqual([]);
});

test("works, empty, when storage is blocked", () => {
  blocked = true;
  expect(getRecentVehicles()).toEqual([]);
  expect(() => recordRecentVehicle(vehicle(1))).not.toThrow();
});

test("clears", () => {
  recordRecentVehicle(vehicle(1));
  clearRecentVehicles();
  expect(getRecentVehicles()).toEqual([]);
});
