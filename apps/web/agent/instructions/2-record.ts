import { defineDynamic, defineInstructions } from "eve/instructions";
import { vehicleRecordForModel } from "@/lib/ai/model-context";
import { loadVehicleRecord } from "@/lib/ai/vehicle-record";
import { sessionVin, uncachedLoaders } from "../lib/vehicle";

// D30 on Eve: the record goes in as a system instruction after the static rules, loaded once per
// turn. Runs before every model call, hence the memo.
export default defineDynamic(async (ctx) => {
  const vin = sessionVin(ctx.session.auth);
  const record = await ctx.memo(ctx.turn?.id ?? ctx.session.id, () => loadVehicleRecord(vin, uncachedLoaders));
  if (!record) return null;
  return defineInstructions({ content: vehicleRecordForModel(record, new Date(), { caseAge: true }) });
});
