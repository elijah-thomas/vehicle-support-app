import { TopBar } from "@/components/top-bar";

export default function VehiclesLayout({ children }: LayoutProps<"/vehicles">) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
