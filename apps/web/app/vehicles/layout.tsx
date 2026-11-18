import { TopBar } from "@/components/shared/top-bar";

export default function VehiclesLayout({ children }: LayoutProps<"/vehicles">) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
