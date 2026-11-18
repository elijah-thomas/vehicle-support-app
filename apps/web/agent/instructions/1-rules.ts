import { defineInstructions } from "eve/instructions";
import { instructions } from "@/lib/ai/agent-instructions";

// The same static prompt as the AI SDK version, first so providers can cache it.
export default defineInstructions({ content: instructions });
