const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
