"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RecordLink } from "@/components/shared/record-link";
import { vehicleView } from "@/lib/vehicle-paths";

// The header stays mounted across the vehicle's pages (layout.tsx), so a chip that points into the
// page has to ask which page is showing. On the overview it scrolls to `overviewTarget`; on a case
// page to `caseTarget` when there is one; anywhere else it opens the overview at the target.
export function PageAwareLink({
  vin,
  overviewTarget,
  caseTarget,
  className,
  children,
}: {
  vin: string;
  overviewTarget: string;
  caseTarget?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const view = vehicleView(usePathname(), vin);
  if (view.kind === "overview") return <RecordLink targetId={overviewTarget} className={className}>{children}</RecordLink>;
  if (view.kind === "case" && caseTarget) return <RecordLink targetId={caseTarget} className={className}>{children}</RecordLink>;
  return (
    <Link href={`/vehicles/${vin}#${overviewTarget}`} className={className}>
      {children}
    </Link>
  );
}

// A link to a page of this vehicle that marks itself as the current item while that page shows.
export function CurrentPageLink({
  href,
  className,
  currentClassName,
  children,
  trailing,
}: {
  href: string;
  className?: string;
  currentClassName?: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const current = usePathname() === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={current ? currentClassName : className}>
      {children}
      {!current && trailing}
    </Link>
  );
}
