import { ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleStatus } from "@/components/vehicle-status";
import { getVehicle, type Vehicle } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";

function specs(model: Vehicle["model"]) {
  return [
    ["Powertrain", model.powertrain],
    ["Battery", model.batteryKwh && `${model.batteryKwh} kWh`],
    ["Range", model.rangeMiles && `${model.rangeMiles} mi`],
    ["Engine", model.engine],
    ["Towing", model.towingLbs && `${model.towingLbs.toLocaleString("en-US")} lbs`],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

export async function VehicleSummary({ vin }: { vin: string }) {
  const vehicle = await getVehicle(vin);
  if (!vehicle) notFound();

  const { model, customer } = vehicle;
  const openRecalls = vehicle.recalls.filter((r) => r.status === "OPEN");

  return (
    <div className="space-y-4">
      {openRecalls.map(({ recall }) => (
        <Alert
          key={recall.campaignNumber}
          id={`recall-${recall.campaignNumber}`}
          variant="warning"
          className="scroll-mt-6 transition-colors"
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
        <CardHeader>
          <CardTitle className="text-xl">
            {model.year} {model.make} {model.model} {model.trim}
          </CardTitle>
          <CardDescription className="font-mono">{vehicle.vin}</CardDescription>
          <div className="mt-2">
            <VehicleStatus vin={vin} openRecallCampaigns={openRecalls.map(({ recall }) => recall.campaignNumber)} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <dl className="space-y-1 text-sm">
            <Row label="Owner" value={`${customer.firstName} ${customer.lastName} · ${customer.email}`} />
            <Row label="Color" value={vehicle.color} />
            <Row label="Purchased" value={formatDate(vehicle.purchasedAt)} />
            <Row label="Software" value={vehicle.softwareVersion} />
          </dl>
          <dl className="space-y-1 text-sm">
            {specs(model).map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </dl>
          {vehicle.installedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:col-span-2">
              {vehicle.installedOptions.map((option) => (
                <Badge key={option} variant="secondary">
                  {option}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
