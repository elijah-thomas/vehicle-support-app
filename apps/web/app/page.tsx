import { TopBar } from "@/components/shared/top-bar";
import { VehicleSearch } from "@/components/search/vehicle-search";

export default function Home() {
  return (
    <>
      <TopBar search={false} />
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Vehicle lookup</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          Find a customer&apos;s vehicle by VIN or email to see its status, history, and open recalls.
        </p>
        <VehicleSearch size="lg" />
      </main>
    </>
  );
}
