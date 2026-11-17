import { FilePlus, Mail, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PeekButton } from "@/components/peek-button";
import { RecordVisit } from "@/components/record-visit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VehicleStatus } from "@/components/vehicle-status";
import { newCaseHref } from "@/lib/cases";
import { getVehicle } from "@/lib/customer/vehicles";

// Phone and email look the same: one outlined button each, icon plus value.
const contactButton = buttonVariants({ variant: "outline", size: "sm", className: "bg-card" });

// The same header on every vehicle page: it lives in the [vin] layout, above whichever view the
// left column shows. Open-recall banners sit here too, so the recall chips reach them from any page.
export async function VehicleHeader({ vin }: { vin: string }) {
  const vehicle = await getVehicle(vin);
  if (!vehicle) notFound();

  const { model, customer } = vehicle;
  const openRecalls = vehicle.recalls.filter((r) => r.status === "OPEN");
  const name = `${model.year} ${model.make} ${model.model} ${model.trim}`;
  const owner = `${customer.firstName} ${customer.lastName}`;

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted px-3 py-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Customer</span>
            <span className="mr-2 font-semibold">{owner}</span>
            <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${customer.phone}`} className={contactButton}>
              <Phone aria-hidden />
              {customer.phone}
            </a>
            <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.email}`} className={contactButton}>
              <Mail aria-hidden />
              {customer.email}
            </a>
            {customer.vehicles.length > 1 && (
              <PeekButton
                label={`${customer.vehicles.length} vehicles`}
                title={`Vehicles on file · ${customer.vehicles.length}`}
                className="sm:ml-auto"
              >
                <ul className="space-y-0.5">
                  {customer.vehicles.map((other) => {
                    const label = `${other.model.year} ${other.model.make} ${other.model.model} ${other.model.trim}`;
                    const vinLine = <span className="block font-mono text-xs whitespace-nowrap text-muted-foreground">{other.vin}</span>;
                    return (
                      <li key={other.vin}>
                        {other.vin === vehicle.vin ? (
                          <span aria-current="page" className="block rounded-md bg-muted px-2 py-1.5">
                            <span className="text-[13px] font-semibold">{label}</span>
                            <span className="text-[13px] text-muted-foreground"> · this vehicle</span>
                            {vinLine}
                          </span>
                        ) : (
                          <Link
                            href={`/vehicles/${other.vin}`}
                            className="block rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <span className="text-[13px] font-semibold">{label}</span>
                            {vinLine}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </PeekButton>
            )}
          </div>
          <VehicleStatus vin={vin} openRecallCampaigns={openRecalls.map(({ recall }) => recall.campaignNumber)} />
        </CardContent>
      </Card>
    </div>
  );
}
