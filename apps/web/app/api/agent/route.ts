import { createAgentUIStreamResponse } from "ai";
import { parseAgentRequest } from "@/lib/ai/agent-request";
import { cachedLoaders, createVehicleAgent } from "@/lib/ai/vehicle-agent";
import { loadVehicleRecord } from "@/lib/ai/vehicle-record";

// Public endpoint, so every request is bounded before the model runs (lib/ai/agent-request.ts),
// and Vercel Firewall rate-limits in front of this. See docs/decisions.md#rate-limiting
export async function POST(request: Request) {
  const parsed = parseAgentRequest(await request.json().catch(() => null));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

  try {
    const record = await loadVehicleRecord(parsed.vin, cachedLoaders);
    if (!record) return errorResponse("not_found", 404);

    return await createAgentUIStreamResponse({
      agent: createVehicleAgent(record),
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

function errorResponse(code: "invalid_request" | "too_long" | "not_found" | "agent_failed", status: number) {
  return Response.json({ error: { code } }, { status });
}
