import { ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { RecordVisit } from "@/components/record-visit";
import { VehicleStatus } from "@/components/vehicle-status";
import { getVehicle, type Vehicle } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";

const powertrainLabel = { EV: "Electric", HYBRID: "Hybrid", GAS: "Gas" } as const;

function specs(vehicle: Vehicle) {
  const { model } = vehicle;
  return [
    ["Powertrain", powertrainLabel[model.powertrain]],
    ["Battery", model.batteryKwh && `${model.batteryKwh} kWh`],
    ["Engine", model.engine],
    ["Range", model.rangeMiles && `${model.rangeMiles.toLocaleString("en-US")} mi`],
    ["Towing", model.towingLbs && `${model.towingLbs.toLocaleString("en-US")} lbs`],
    ["Color", vehicle.color],
    ["Purchased", formatDate(vehicle.purchasedAt)],
    ["Software", vehicle.softwareVersion],
    ["Options", vehicle.installedOptions.join(", ")],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

export async function VehicleSummary({ vin }: { vin: string }) {
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
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{vehicle.vin}</span> · {owner} · {customer.email}
            </p>
          </div>
          <VehicleStatus vin={vin} openRecallCampaigns={openRecalls.map(({ recall }) => recall.campaignNumber)} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-4">
            {specs(vehicle).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
