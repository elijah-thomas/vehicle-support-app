"use client";

import { useEffect } from "react";
import { recordRecentVehicle } from "@/lib/recent-vehicles";

export function RememberRecentVehicle({ vin, name, owner }: { vin: string; name: string; owner: string }) {
  useEffect(() => {
    recordRecentVehicle({ vin, name, owner });
  }, [vin, name, owner]);
  return null;
}
