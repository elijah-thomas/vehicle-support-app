import { PeekButton } from "@/components/peek-button";
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
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

// One field's value, so a short list peeks: the first option, then the rest behind its count.
// Option names are never abbreviated.
function InstalledOptions({ options }: { options: string[] }) {
  const [first, ...rest] = options;
  if (!first) return "None";
  if (rest.length === 0) return first;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {first}
      <PeekButton label={`+${rest.length} more`} title={`Installed options · ${options.length}`} className="h-6 px-2 text-xs">
        <ul className="space-y-0.5 px-2 pb-1 text-[13px]">
          {options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ul>
      </PeekButton>
    </span>
  );
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
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Options</dt>
            <dd className="text-sm">
              <InstalledOptions options={vehicle.installedOptions} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
