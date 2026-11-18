import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { earlierAnswers, parseAgentRequest } from "@/lib/ai/agent-request";
import { cachedLoaders, createVehicleAgent, type VehicleAgentMessage } from "@/lib/ai/vehicle-agent";
import { logUsage } from "@/lib/ai/usage";
import { loadVehicleRecord } from "@/lib/ai/load-vehicle-record";

// Decision (D18, D27): a public endpoint, so Vercel Firewall rate-limits it at the edge and every
// request is checked before the model runs (lib/ai/agent-request.ts). Why: a blocked request
// costs no compute and no tokens. Trade-off: per-IP, so spend alerts are the backstop.
// See docs/decisions.md#rate-limits
export async function POST(request: Request) {
  const parsed = parseAgentRequest(await request.json().catch(() => null));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

  try {
    const record = await loadVehicleRecord(parsed.vin, cachedLoaders);
    if (!record) return errorResponse("not_found", 404);

    const agent = createVehicleAgent(record, {
      earlierAnswers: earlierAnswers(parsed.messages),
      onUsage: (steps) => logUsage("agent", steps),
    });
    const stream = createUIMessageStream<VehicleAgentMessage>({
      execute: async ({ writer }) => {
        // Sent as soon as the record is loaded, before the model's first word, so the panel can
        // tell reading the record from the model working on the answer. Transient: not saved in
        // the message, so it never returns in the history.
        writer.write({ type: "data-status", data: "answering", transient: true });
        writer.merge(await createAgentUIStream({ agent, uiMessages: parsed.messages }));
      },
      // Failures after streaming starts reach the client as this text, so it parses like a 500.
      onError: (error) => {
        console.error("agent stream failed", error);
        return JSON.stringify({ error: { code: "agent_failed" } });
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("agent failed", error);
    return errorResponse("agent_failed", 500);
  }
}

function errorResponse(code: "invalid_request" | "too_long" | "not_found" | "agent_failed", status: number) {
  return Response.json({ error: { code } }, { status });
}
