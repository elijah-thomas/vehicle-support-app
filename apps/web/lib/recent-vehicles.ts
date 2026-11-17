// Decision (D21): suggestions come from this browser, not a server prefix search, which would let
// anyone list customers. Only VIN, vehicle name and owner name are kept, never emails.
// See docs/decisions.md#lookup-and-layout
export type RecentVehicle = { vin: string; name: string; owner: string; openedAt: string };

const KEY = "vs:recent";
const LIMIT = 5;
const CHANGE_EVENT = "vs:recent-change";
const EMPTY: RecentVehicle[] = [];

let cachedRaw: string | null = null;
let cachedList: RecentVehicle[] = EMPTY;

function read(): RecentVehicle[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? parsed.filter(isRecentVehicle).slice(0, LIMIT) : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

function write(list: RecentVehicle[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked or full: recents are a convenience, so carry on without them.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isRecentVehicle(value: unknown): value is RecentVehicle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return [v.vin, v.name, v.owner, v.openedAt].every((field) => typeof field === "string");
}

export function recordRecentVehicle(vehicle: Omit<RecentVehicle, "openedAt">) {
  const others = read().filter((v) => v.vin !== vehicle.vin);
  write([{ ...vehicle, openedAt: new Date().toISOString() }, ...others].slice(0, LIMIT));
}

export function clearRecentVehicles() {
  write([]);
}

// For useSyncExternalStore: other tabs fire "storage", this tab fires CHANGE_EVENT.
export function subscribeRecentVehicles(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export const getRecentVehicles = read;
export const getServerRecentVehicles = () => EMPTY;
