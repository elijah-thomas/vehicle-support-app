import { defineTool } from "eve/tools";
import { getTelematicsDescription, getTelematicsInput } from "@/lib/ai/agent-instructions";
import { telematicsForModel } from "@/lib/ai/model-context";
import { sessionVin, uncachedLoaders } from "../lib/vehicle";

// The same tool as the AI SDK version, with no VIN input: the vehicle is the conversation's.
export default defineTool({
  description: getTelematicsDescription,
  inputSchema: getTelematicsInput,
  async execute({ limit }, ctx) {
    const events = await uncachedLoaders.getTelematics(sessionVin(ctx.session.auth), limit);
    return events ? telematicsForModel(events) : [];
  },
});
