import { Car } from "lucide-react";
import Link from "next/link";
import { VehicleSearch } from "@/components/vehicle-search";

// The landing page has its own large lookup, so the bar's search is left off there.
export function TopBar({ search = true }: { search?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-6 border-b bg-card px-6">
      <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-semibold">
        <Car className="size-4.5 text-primary" aria-hidden />
        Vehicle Support
      </Link>
      {search && <VehicleSearch className="w-[440px] min-w-0" />}
    </header>
  );
}
