import { defineTool } from "eve/tools";
import { z } from "zod";
import { telematicsForModel } from "@/lib/ai/model-context";
import { RECORD_TELEMATICS } from "@/lib/ai/vehicle-record";
import { sessionVin, uncachedLoaders } from "../lib/vehicle";

// Same description and input as the AI SDK tool. No VIN input: it comes from the session.
export default defineTool({
  description: `Older telematics events for this vehicle, newest first, including the ${RECORD_TELEMATICS} already in the record. Call it only when the question needs history beyond those, such as when a fault code first appeared. Returns fault codes (DTC), battery, odometer, and software events with dates and how often each code repeats. It has no cases or recalls; those are all in the record.`,
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(RECORD_TELEMATICS + 1)
      .max(50)
      .describe(`How many recent events to return, ${RECORD_TELEMATICS + 1} to 50`),
  }),
  async execute({ limit }, ctx) {
    const events = await uncachedLoaders.getTelematics(sessionVin(ctx.session.auth), limit);
    return events ? telematicsForModel(events) : [];
  },
});
