import type { Case, TelematicsEvent } from "@/lib/customer/vehicle-records";

const DAY = 24 * 60 * 60 * 1000;

// See docs/decisions.md#case-view
export const OVERDUE_AFTER_BUSINESS_DAYS = 5;
export const RELATED_FAULT_WINDOW_DAYS = 7;

// The newest note, or the day the case was opened if nobody has written one yet.
export function lastContact(supportCase: Case) {
  const times = [supportCase.openedAt, ...supportCase.notes.map((note) => note.createdAt)];
  return times.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest));
}

// Weekdays after `fromIso`'s day, up to and including `now`'s day, in UTC like every date on the
// page. Holidays aren't modeled.
export function businessDaysSince(fromIso: string, now: number) {
  const startOfDay = (time: number) => Math.floor(time / DAY) * DAY;
  let count = 0;
  for (let day = startOfDay(Date.parse(fromIso)) + DAY; day <= startOfDay(now); day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function contactStatus(supportCase: Case, now: number) {
  const last = lastContact(supportCase);
  const daysWithoutContact = businessDaysSince(last, now);
  return {
    lastContact: last,
    daysWithoutContact,
    overdue: supportCase.status === "OPEN" && daysWithoutContact > OVERDUE_AFTER_BUSINESS_DAYS,
  };
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

// Cases whose fault windows a case's related-faults panel reads: the case and every earlier one.
export function casesNeedingFaultWindows(supportCase: Case, cases: Case[]) {
  const opened = Date.parse(supportCase.openedAt);
  return cases.filter((other) => other.id === supportCase.id || Date.parse(other.openedAt) < opened);
}

// Earlier cases on the vehicle that were matched to one of the same fault codes.
export function earlierCasesWithSameFault(supportCase: Case, cases: Case[], events: TelematicsEvent[]) {
  const codes = new Set(relatedFaults(supportCase, events).map((event) => event.code));
  if (codes.size === 0) return [];
  return cases.filter(
    (other) =>
      Date.parse(other.openedAt) < Date.parse(supportCase.openedAt) &&
      relatedFaults(other, events).some((event) => codes.has(event.code)),
  );
}

export function caseHref(vin: string, caseId: string) {
  return `/vehicles/${vin}/cases/${encodeURIComponent(caseId)}`;
}
