import { VIN_PATTERN } from "@/lib/format";

export type SuggestedVehicle = { vin: string; name: string; owner: string; hint: string };

// The seeded vehicles, offered when the lookup opens so each record is one step away.
export const suggestedVehicles: SuggestedVehicle[] = [
  { vin: "0MRAE4LR5RA100001", name: "2024 Meridian Aster EV Long Range", owner: "Dana Whitfield", hint: "Recurring battery fault" },
  { vin: "0MRKC15V8PA200002", name: "2023 Meridian Kestrel 1500 Crew Cab", owner: "Marcus Bell", hint: "Open recall" },
  { vin: "0MRSH25H9PA500006", name: "2023 Meridian Solace Hybrid", owner: "Sam Torres", hint: "Fault returned after repair" },
  { vin: "0MRKW15T6MA400005", name: "2021 Meridian Kestrel 1500 Work Truck", owner: "Jordan Okafor", hint: "Coolant warning" },
  { vin: "0MRAE4SR2NA400004", name: "2022 Meridian Aster EV Standard", owner: "Jordan Okafor", hint: "No open issues" },
  { vin: "0MRSH25H1TA300003", name: "2026 Meridian Solace Hybrid Premier", owner: "Priya Raman", hint: "No open issues" },
];

export type QueryKind = "empty" | "email" | "vin" | "text";

// Names never contain digits, so a digit is what marks a VIN being typed.
export function queryKind(query: string): QueryKind {
  if (!query) return "empty";
  if (query.includes("@")) return "email";
  if (/\d/.test(query)) return "vin";
  return "text";
}

// VINs are uppercase, with no spaces or dashes; everything else is kept as typed.
export function normalizeQuery(raw: string) {
  const trimmed = raw.trimStart();
  return queryKind(trimmed) === "vin" ? trimmed.toUpperCase().replace(/[\s-]/g, "") : trimmed;
}

export type VinCheck =
  | { tone: "neutral"; text: string }
  | { tone: "ok"; text: string }
  | { tone: "error"; text: string };

export function checkVin(vin: string): VinCheck {
  const banned = vin.match(/[IOQ]/);
  if (banned) return { tone: "error", text: `VIN can't contain ${banned[0]}` };
  if (/[^A-Z0-9]/.test(vin)) return { tone: "error", text: "VIN uses letters and digits only" };
  if (vin.length > 17) return { tone: "error", text: "VIN is 17 characters" };
  if (VIN_PATTERN.test(vin)) return { tone: "ok", text: "VIN · Enter to open" };
  return { tone: "neutral", text: `VIN · ${vin.length}/17` };
}

const VIN_IN_TEXT = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const EMAIL_IN_TEXT = /[^\s@<>()[\],;:"']+@[^\s@<>()[\],;:"']+\.[a-z]{2,}/i;

// "VIN: 0MRKC15V8PA200002 called about camera" → "0MRKC15V8PA200002". A VIN wins over an email.
export function lookupInPastedText(text: string) {
  const vin = text.match(VIN_IN_TEXT)?.[0];
  if (vin) return vin.toUpperCase();
  return text.match(EMAIL_IN_TEXT)?.[0] ?? null;
}

// Where `query` matches `text`, for bolding: a VIN matches from its start, anything else anywhere.
export function matchRange(text: string, query: string, prefixOnly = false): [number, number] | null {
  if (!query) return null;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || (prefixOnly && at > 0)) return null;
  return [at, at + query.length];
}
