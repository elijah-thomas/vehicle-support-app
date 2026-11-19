import { defineDynamic, defineInstructions } from "eve/instructions";
import { loadVehicleRecord } from "@/lib/ai/load-vehicle-record";
import { earlierNextStepsForModel, vehicleRecordForModel } from "@/lib/ai/model-context";
import { sessionVin, uncachedLoaders } from "../lib/vehicle";

// The record (D16) and the next steps already given (D17), as in the AI SDK version. Eve runs this
// before every model call, so the record is loaded once per turn.
export default defineDynamic(async (ctx) => {
  const vin = sessionVin(ctx.session.auth);
  const record = await ctx.memo(ctx.turn?.id ?? ctx.session.id, () => loadVehicleRecord(vin, uncachedLoaders));
  if (!record) return null;
  const earlierAnswers = (await ctx.messages()).flatMap((message) => (message.role === "assistant" ? [textOf(message.content)] : []));
  return defineInstructions({
    content: [vehicleRecordForModel(record, new Date(), { caseAge: true }), earlierNextStepsForModel(earlierAnswers)].join("\n\n"),
  });
});

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")).join("");
}
