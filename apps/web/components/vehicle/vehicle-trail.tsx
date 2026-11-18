"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nextTrail, vehicleView, viewLabel } from "@/lib/vehicle-paths";

const crumbLink = "text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Decision (D41): the path the rep took within this vehicle, held in the [vin] layout's state, not
// the URL, so a shared link opens the case rather than someone's route to it. Rendered with
// key={vin}, so a new vehicle starts a new trail. See docs/decisions.md#vehicle-routes
export function VehicleTrail({ vin }: { vin: string }) {
  const pathname = usePathname();
  const overview = `/vehicles/${vin}`;
  const [trail, setTrail] = useState(() => nextTrail([], pathname, overview));
  const [seen, setSeen] = useState(pathname);
  const [expanded, setExpanded] = useState(false);

  // Follow navigation during render (React's pattern for state derived from a changing value).
  if (pathname !== seen) {
    setSeen(pathname);
    setTrail(nextTrail(trail, pathname, overview));
    setExpanded(false);
  }

  // Only the vehicle's own views have a place in the trail; an unknown URL shows not-found alone.
  if (trail.length < 2 || vehicleView(pathname, vin).kind === "other") return null;

  // At most three steps: the first, the one before this page, and this page. Older steps collapse
  // behind "…".
  const hidden = !expanded && trail.length > 3 ? trail.slice(1, -2) : [];
  const shown = hidden.length > 0 ? [trail[0]!, ...trail.slice(-2)] : trail;

  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
        {shown.map((path, index) => {
          const current = index === shown.length - 1;
          return (
            <li key={path} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
              {index === 1 && hidden.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    aria-expanded={false}
                    aria-label={`Show ${hidden.length} more ${hidden.length === 1 ? "step" : "steps"}`}
                    className="rounded-sm px-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    …
                  </button>
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                </>
              )}
              {current ? (
                <span aria-current="page" className="font-medium whitespace-nowrap">
                  {viewLabel(vehicleView(path, vin))}
                </span>
              ) : (
                <Link href={path} className={`${crumbLink} whitespace-nowrap`}>
                  {viewLabel(vehicleView(path, vin))}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
