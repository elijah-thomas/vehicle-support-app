import "server-only";
import type { Case, TelematicsEvent, Vehicle } from "@/lib/customer/vehicles";
import { toBlocks } from "@/lib/agent-answer-blocks";
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
// - repeat counts and an open case's days since its last update computed here, so "this code keeps
//   coming back" and "waiting 12 days" are facts, not inferences the model has to reason toward
// See docs/decisions.md#agent-context
// caseAge: the agent answers "how long has it waited?"; the call summary doesn't, so its input stays
// as it was.
export function vehicleRecordForModel(record: VehicleRecord, asOf: Date, { caseAge = false } = {}) {
  const { vehicle, cases, telematics } = record;
  return [
    `<vehicle_record as_of="${formatDate(asOf.toISOString())}">`,
    tag("vehicle", vehicleForModel(vehicle)),
    tag("telematics", telematics === UNAVAILABLE ? UNAVAILABLE : telematicsForModel(telematics ?? [])),
    tag("cases", cases === UNAVAILABLE ? UNAVAILABLE : casesForModel(cases ?? [], caseAge ? asOf : null)),
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

const DAY_MS = 24 * 60 * 60 * 1000;

function casesForModel(cases: Case[], asOf: Date | null) {
  return cases.map((c) => ({
    caseNumber: formatCaseNumber(c.number),
    subject: c.subject,
    status: c.status,
    category: c.category,
    opened: formatDate(c.openedAt),
    closed: c.closedAt && formatDate(c.closedAt),
    ...(asOf && c.status === "OPEN" && sinceLastUpdate(c, asOf)),
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

// The newest note, or the opening if there are none. Whole days, counted from asOf.
function sinceLastUpdate(c: Case, asOf: Date) {
  const last = Math.max(Date.parse(c.openedAt), ...c.notes.map((n) => Date.parse(n.createdAt)));
  return {
    lastUpdate: formatDate(new Date(last).toISOString()),
    daysSinceUpdate: Math.max(0, Math.floor((asOf.getTime() - last) / DAY_MS)),
  };
}

// Next steps the earlier answers in this conversation already gave, read with the panel's parser,
// so the model checks a list instead of rereading the history. See docs/decisions.md#answer-shape
export function earlierNextStepsForModel(answers: string[]) {
  const steps = answers.flatMap((text) => toBlocks(text).flatMap((b) => (b.kind === "next-steps" ? b.items : [])));
  const list = steps.length > 0 ? `\n${steps.map((s) => `- ${s}`).join("\n")}\n` : "none";
  return `<earlier_next_steps>${list}</earlier_next_steps>`;
}
