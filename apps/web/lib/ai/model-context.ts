import "server-only";
import type { Case, TelematicsEvent, Vehicle } from "@/lib/customer/vehicles";
import { formatCaseNumber, formatDate } from "@/lib/format";
import { occurrences, repeatKey } from "@/lib/telematics";

// A source that couldn't be loaded, so the model can say so rather than treat it as empty.
export const UNAVAILABLE = "unavailable";

export type VehicleRecord = {
  vehicle: Vehicle;
  cases: Case[] | null | typeof UNAVAILABLE;
  telematics: TelematicsEvent[] | null | typeof UNAVAILABLE;
};

// What the models see of a vehicle. Shaped for the model, not passed through from the API:
// - no internal IDs: they mean nothing to a rep, and a model that never sees one can't quote one.
//   Case numbers (CS-24117) are different: reps read and say them, so the model gets those.
//   Decision (D40). See docs/decisions.md#case-numbers
// - dates already in the format answers use, so the model never converts timestamps
// - repeat counts computed here, so "this code keeps coming back" is a fact, not an inference
// See docs/decisions.md#agent-context
export function vehicleRecordForModel(record: VehicleRecord, asOf: Date) {
  const { vehicle, cases, telematics } = record;
  return [
    `<vehicle_record as_of="${formatDate(asOf.toISOString())}">`,
    tag("vehicle", vehicleForModel(vehicle)),
    tag("telematics", telematics === UNAVAILABLE ? UNAVAILABLE : telematicsForModel(telematics ?? [])),
    tag("cases", cases === UNAVAILABLE ? UNAVAILABLE : casesForModel(cases ?? [])),
    "</vehicle_record>",
  ].join("\n");
}

function tag(name: string, content: unknown) {
  return `<${name}>${typeof content === "string" ? content : JSON.stringify(content)}</${name}>`;
}

function vehicleForModel(vehicle: Vehicle) {
  return {
    vin: vehicle.vin,
    ...vehicle.model,
    color: vehicle.color,
    purchased: formatDate(vehicle.purchasedAt),
    softwareVersion: vehicle.softwareVersion,
    installedOptions: vehicle.installedOptions,
    owner: {
      firstName: vehicle.customer.firstName,
      lastName: vehicle.customer.lastName,
      email: vehicle.customer.email,
    },
    recalls: vehicle.recalls.map(({ recall, status, completedAt }) => ({
      ...recall,
      status,
      completed: completedAt && formatDate(completedAt),
    })),
  };
}

// Events newest first, as the API returns them.
export function telematicsForModel(events: TelematicsEvent[]) {
  const nth = occurrences(events);
  const totals = new Map<string, number>();
  for (const event of events) totals.set(repeatKey(event), (totals.get(repeatKey(event)) ?? 0) + 1);

  return events.map((event) => {
    const total = totals.get(repeatKey(event)) ?? 1;
    return {
      recorded: formatDate(event.recordedAt),
      type: event.type,
      code: event.code,
      severity: event.severity,
      message: event.message,
      value: event.value,
      ...(total > 1 && { occurrence: `${nth.get(event.id)} of ${total} in these events` }),
    };
  });
}

function casesForModel(cases: Case[]) {
  return cases.map((c) => ({
    caseNumber: formatCaseNumber(c.number),
    subject: c.subject,
    status: c.status,
    category: c.category,
    opened: formatDate(c.openedAt),
    closed: c.closedAt && formatDate(c.closedAt),
    description: c.description,
    resolution: c.resolution,
    notes: c.notes.map((n) => ({
      date: formatDate(n.createdAt),
      source: n.source,
      ...(n.issue && { issue: n.issue }),
      summary: n.summary,
      nextSteps: n.nextSteps,
    })),
  }));
}
