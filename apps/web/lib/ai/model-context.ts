import "server-only";
import type { Case, TelematicsEvent } from "@/lib/customer/vehicles";

// What the model sees. Internal IDs are stripped: they mean nothing to a rep, and a model that
// never sees an ID can't quote one (a prompt rule alone wasn't reliable).
function withoutId<T extends { id: string }>(record: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...record };
  delete copy.id;
  return copy as Omit<T, "id">;
}

export function casesForModel(cases: Case[] | null) {
  return cases?.map((c) => ({ ...withoutId(c), notes: c.notes.map(withoutId) })) ?? null;
}

export function telematicsForModel(events: TelematicsEvent[] | null) {
  return events?.map(withoutId) ?? null;
}
