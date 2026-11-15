import Link from "next/link";

export default function VehicleNotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">Vehicle not found</h1>
      <p className="mt-2 text-muted-foreground">No vehicle matches that VIN.</p>
      <Link href="/" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">
        ← New lookup
      </Link>
    </main>
  );
}
