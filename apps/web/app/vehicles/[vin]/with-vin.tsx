import { notFound } from "next/navigation";
import { VIN_PATTERN } from "@/lib/format";

// Reading params is request-time work, so it happens inside each Suspense boundary.
export async function WithVin({
  params,
  children,
}: {
  params: Promise<{ vin: string }>;
  children: (vin: string) => React.ReactNode;
}) {
  const vin = (await params).vin.toUpperCase();
  if (!VIN_PATTERN.test(vin)) notFound();
  return children(vin);
}
