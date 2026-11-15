import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { createVehicleAgent } from "@/lib/ai/vehicle-agent";
import { VIN_PATTERN } from "@/lib/format";

// Public endpoint, so every request is bounded: last 10 messages, 2,000 characters per text
// part, plus the agent's step and token caps. Vercel Firewall rate-limits in front of this.
// See docs/decisions.md#rate-limiting
const MAX_MESSAGES = 10;
const MAX_TEXT_LENGTH = 2000;

const requestSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN),
  messages: z.array(z.looseObject({ role: z.string(), parts: z.array(z.looseObject({ type: z.string() })) })).min(1),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { vin, messages } = parsed.data;
  const tooLong = messages.some((m) =>
    m.parts.some((p) => p.type === "text" && typeof p.text === "string" && p.text.length > MAX_TEXT_LENGTH),
  );
  if (tooLong) return Response.json({ error: "Message too long" }, { status: 413 });

  return createAgentUIStreamResponse({
    agent: createVehicleAgent(vin),
    uiMessages: messages.slice(-MAX_MESSAGES),
  });
}
