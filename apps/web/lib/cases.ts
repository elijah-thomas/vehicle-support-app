import type { Case, TelematicsEvent } from "@/lib/customer/vehicle-records";

const DAY = 24 * 60 * 60 * 1000;

export const RELATED_FAULT_WINDOW_DAYS = 7;

// The newest note, or the day the case was opened if nobody has written one yet.
export function lastContact(supportCase: Case) {
  const times = [supportCase.openedAt, ...supportCase.notes.map((note) => note.createdAt)];
  return times.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest));
}

// Reopening a case writes this rep note (services/vehicle-api, POST /cases/:id/reopen), so the
// activity shows it as "Reopened" rather than as a note the rep can remove.
export function isReopenNote(note: Case["notes"][number]) {
  return note.source === "REP" && note.issue === "Case reopened";
}

// Open cases first, then newest opened.
export function sortCases(cases: Case[]) {
  return [...cases].sort(
    (a, b) => Number(b.status === "OPEN") - Number(a.status === "OPEN") || Date.parse(b.openedAt) - Date.parse(a.openedAt),
  );
}

// The week before a case opened, as ISO times: what related faults are fetched and matched against.
export function faultWindow(supportCase: Case) {
  const opened = Date.parse(supportCase.openedAt);
  return { from: new Date(opened - RELATED_FAULT_WINDOW_DAYS * DAY).toISOString(), to: new Date(opened).toISOString() };
}

// Faults logged in the week before a case opened. Cases carry no link to telematics, so this is
// a match by date, and the page labels it as one.
export function relatedFaults(supportCase: Case, events: TelematicsEvent[]) {
  const { from, to } = faultWindow(supportCase);
  return events.filter((event) => {
    const recorded = Date.parse(event.recordedAt);
    return event.code && recorded <= Date.parse(to) && recorded >= Date.parse(from);
  });
}

/**
 * Which fault led to which case. Cases carry no link to telematics in the customer's system, so
 * this is a match by date and code, worked out here:
 * - a case's fault is the newest coded event logged in the 7 days before the case opened (the
 *   same window as relatedFaults);
 * - a fault event led to a case when that case opened 0 to 7 days after it and was matched to the
 *   same code. If several cases qualify, the earliest one wins.
 * The vehicle overview (telematics rows and case rows) and the case view's fault history both use
 * this, so they always agree. The rule stays out of the UI: the page shows only the result.
 */
export function matchFaultsToCases(cases: Case[], events: TelematicsEvent[]) {
  const faultForCase = new Map<string, TelematicsEvent>();
  for (const supportCase of cases) {
    const newest = relatedFaults(supportCase, events).reduce<TelematicsEvent | null>(
      (latest, event) => (!latest || Date.parse(event.recordedAt) > Date.parse(latest.recordedAt) ? event : latest),
      null,
    );
    if (newest) faultForCase.set(supportCase.id, newest);
  }

  const byOpened = [...cases].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  const caseForEvent = new Map<string, Case>();
  for (const event of events) {
    if (!event.code) continue;
    const recorded = Date.parse(event.recordedAt);
    const ledTo = byOpened.find((supportCase) => {
      const opened = Date.parse(supportCase.openedAt);
      return (
        opened >= recorded &&
        opened - recorded <= RELATED_FAULT_WINDOW_DAYS * DAY &&
        faultForCase.get(supportCase.id)?.code === event.code
      );
    });
    if (ledTo) caseForEvent.set(event.id, ledTo);
  }
  return { faultForCase, caseForEvent };
}

// Whole days from a fault to the case it led to, as the overview says it ("opened 2 days later").
export function daysBetween(fromIso: string, toIso: string) {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY);
}

// Case URLs use the number reps read aloud, never the internal ID. See docs/decisions.md#case-numbers
export function caseHref(vin: string, number: number) {
  return `/vehicles/${vin}/cases/${number}`;
}

export function newCaseHref(vin: string) {
  return `/vehicles/${vin}/cases/new`;
}

// The categories already in the customer's case system, offered as suggestions; any text is valid.
export const CASE_CATEGORIES = ["Battery & Charging", "Charging", "Electrical", "Engine & Emissions"];
