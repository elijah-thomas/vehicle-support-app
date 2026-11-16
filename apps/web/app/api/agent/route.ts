import { createAgentUIStreamResponse } from "ai";
import { parseAgentRequest } from "@/lib/ai/agent-request";
import { createVehicleAgent } from "@/lib/ai/vehicle-agent";

// Public endpoint, so every request is bounded before the model runs (lib/ai/agent-request.ts),
// and Vercel Firewall rate-limits in front of this. See docs/decisions.md#rate-limiting
export async function POST(request: Request) {
  const parsed = parseAgentRequest(await request.json().catch(() => null));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

  try {
    return await createAgentUIStreamResponse({
      agent: createVehicleAgent(parsed.vin),
      uiMessages: parsed.messages,
      // Failures after streaming starts reach the client as this text, so it parses like a 500.
      onError: (error) => {
        console.error("agent stream failed", error);
        return JSON.stringify({ error: { code: "agent_failed" } });
      },
    });
  } catch (error) {
    console.error("agent failed", error);
    return errorResponse("agent_failed", 500);
  }
}

function errorResponse(code: "invalid_request" | "too_long" | "agent_failed", status: number) {
  return Response.json({ error: { code } }, { status });
}
