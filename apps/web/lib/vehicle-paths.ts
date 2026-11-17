// What a vehicle URL shows, shared by the header's chips and the breadcrumb trail.
export type VehicleView = { kind: "overview" } | { kind: "case"; number: number } | { kind: "new-case" } | { kind: "other" };

export function vehicleView(pathname: string, vin: string): VehicleView {
  const base = `/vehicles/${vin}`;
  if (pathname === base) return { kind: "overview" };
  if (pathname === `${base}/cases/new`) return { kind: "new-case" };
  const match = pathname.match(/^\/vehicles\/[^/]+\/cases\/(\d+)$/);
  if (match && pathname.startsWith(`${base}/`)) return { kind: "case", number: Number(match[1]) };
  return { kind: "other" };
}

export function viewLabel(view: VehicleView) {
  switch (view.kind) {
    case "overview":
      return "Telematics and cases";
    case "case":
      return `CS-${view.number}`;
    case "new-case":
      return "New case";
    default:
      return "Vehicle";
  }
}

// The path a rep took within one vehicle, kept out of the URL. Back (or a crumb) returns to a step
// already in the trail, which drops everything after it; anything else is a new step. A page
// opened directly starts at the overview. The new-case form is never a step behind the rep: the
// page after it (usually the case it just opened) takes its place.
export function nextTrail(trail: string[], pathname: string, overview: string): string[] {
  if (trail.length === 0) return pathname === overview ? [overview] : [overview, pathname];
  const index = trail.indexOf(pathname);
  if (index >= 0) return trail.slice(0, index + 1);
  const leavingNewCase = trail.at(-1) === `${overview}/cases/new`;
  return [...(leavingNewCase ? trail.slice(0, -1) : trail), pathname];
}
