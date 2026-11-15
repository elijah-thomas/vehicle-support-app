// UTC everywhere, so the page and the assistant (which reads raw UTC timestamps) agree on dates.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
