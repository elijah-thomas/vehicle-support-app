import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicle } from "@/lib/customer/vehicles";

export async function CaseVehicleHeader({ vin }: { vin: string }) {
  const vehicle = await getVehicle(vin);
  if (!vehicle) notFound();
  const { model, customer } = vehicle;

  return (
    <div className="space-y-1">
      <Link href={`/vehicles/${vin}`} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        <ChevronLeft className="size-4" aria-hidden />
        {model.year} {model.make} {model.model} {model.trim}
      </Link>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{vin}</span> · {customer.firstName} {customer.lastName} · {customer.email}
      </p>
    </div>
  );
}
