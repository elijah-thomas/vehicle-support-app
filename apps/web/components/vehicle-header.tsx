import { FilePlus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordVisit } from "@/components/record-visit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VehicleStatus } from "@/components/vehicle-status";
import { newCaseHref } from "@/lib/cases";
import { getVehicle } from "@/lib/customer/vehicles";

// The same header on every vehicle page: it lives in the [vin] layout, above whichever view the
// left column shows. Open-recall banners sit here too, so the recall chips reach them from any page.
export async function VehicleHeader({ vin }: { vin: string }) {
  const vehicle = await getVehicle(vin);
  if (!vehicle) notFound();

  const { model, customer } = vehicle;
  const openRecalls = vehicle.recalls.filter((r) => r.status === "OPEN");
  const name = `${model.year} ${model.make} ${model.model} ${model.trim}`;
  const owner = `${customer.firstName} ${customer.lastName}`;
  const otherVehicles = customer.vehicles.filter((other) => other.vin !== vehicle.vin);

  return (
    <div className="space-y-4">
      <RecordVisit vin={vehicle.vin} name={name} owner={owner} />
      {openRecalls.map(({ recall }) => (
        <Alert
          key={recall.campaignNumber}
          id={`recall-${recall.campaignNumber}`}
          variant="warning"
          className="scroll-mt-18 transition-colors"
        >
          <ShieldAlert aria-hidden />
          <AlertTitle>
            Open recall <span className="font-mono">{recall.campaignNumber}</span>: {recall.title}
          </AlertTitle>
          <AlertDescription>
            {recall.description} <span className="font-medium text-foreground">Remedy:</span> {recall.remedy}
          </AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
              <p className="mt-0.5 font-mono text-xs whitespace-nowrap">{vehicle.vin}</p>
            </div>
            <Link href={newCaseHref(vin)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FilePlus aria-hidden />
              New case
            </Link>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>
              {owner} · {customer.email}
            </p>
            {otherVehicles.length > 0 && (
              <p className="mt-0.5">
                Also owns:{" "}
                {otherVehicles.map((other, index) => (
                  <span key={other.vin}>
                    {index > 0 && ", "}
                    <Link href={`/vehicles/${other.vin}`} className="text-primary underline-offset-4 hover:underline">
                      {other.model.year} {other.model.make} {other.model.model} {other.model.trim}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
          <VehicleStatus vin={vin} openRecallCampaigns={openRecalls.map(({ recall }) => recall.campaignNumber)} />
        </CardContent>
      </Card>
    </div>
  );
}
