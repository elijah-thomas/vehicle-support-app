// TEMPORARY: WIF boundary spike. Proves the Vercel → GCP auth chain end to end, and tests
// whether the OIDC token is reachable from inside a "use cache" function. Delete after.
import { Suspense } from "react";
import { getVehicle } from "@/lib/customer/vehicles";

const VIN = "0MRKC15V8PA200002";

async function cachedGetVehicle(vin: string) {
  "use cache";
  return getVehicle(vin);
}

async function Result({ label, load }: { label: string; load: () => Promise<unknown> }) {
  const outcome = await load().then(
    (data) => ({ ok: true, text: JSON.stringify(data, null, 2) }),
    (error) => ({ ok: false, text: String(error) }),
  );
  return (
    <section className={`rounded border p-4 ${outcome.ok ? "" : "border-red-400"}`}>
      <h2 className="font-medium">
        {label}: {outcome.ok ? "ok" : "failed"}
      </h2>
      <pre className="mt-2 whitespace-pre-wrap text-xs">{outcome.text}</pre>
    </section>
  );
}

async function Uncached() {
  const { connection } = await import("next/server");
  await connection();
  return <Result label="Uncached (request time)" load={() => getVehicle(VIN)} />;
}

async function Cached() {
  const { connection } = await import("next/server");
  await connection();
  return <Result label='Inside "use cache"' load={() => cachedGetVehicle(VIN)} />;
}

export default function SpikePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-xl font-semibold">Boundary spike</h1>
      <Suspense fallback={<p>Loading uncached…</p>}>
        <Uncached />
      </Suspense>
      <Suspense fallback={<p>Loading cached…</p>}>
        <Cached />
      </Suspense>
    </main>
  );
}
