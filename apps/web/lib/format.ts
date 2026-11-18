// UTC everywhere, so the page and the assistant (which reads raw UTC timestamps) agree on dates.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}

// How reps write and say a case number.
export function formatCaseNumber(number: number) {
  return `CS-${number}`;
}

export function formatDateTime(iso: string) {
  return `${dateTimeFormat.format(new Date(iso))} UTC`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now: number) {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed <= 60 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return formatDate(iso);
}

export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const unitSuffix: Record<string, string> = { miles: " mi", "%": "%" };

// The telematics API sends units only inside message text ("Odometer reading (miles)"), so the
// unit is read from there. See docs/decisions.md#faults
export function telematicsReading(message: string, value: number | null) {
  const match = message.match(/^(.*?)\s*\(([^)]+)\)$/);
  const label = match ? match[1] : message;
  if (value === null) return { label, value: null };
  const unit = match ? (unitSuffix[match[2]] ?? ` ${match[2]}`) : "";
  return { label, value: `${value.toLocaleString("en-US")}${unit}` };
}
