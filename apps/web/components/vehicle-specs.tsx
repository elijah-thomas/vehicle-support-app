import { Card, CardContent } from "@/components/ui/card";
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

// The vehicle's configuration, on the overview only. The header above it says not found.
export async function VehicleSpecs({ vin }: { vin: string }) {
  const vehicle = await getVehicle(vin);
  if (!vehicle) return null;

  return (
    <Card aria-label="Vehicle specs">
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {specs(vehicle).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
