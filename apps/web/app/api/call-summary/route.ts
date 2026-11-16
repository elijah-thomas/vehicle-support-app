import { createTextStreamResponse, streamText, toTextStream } from "ai";
import { z } from "zod";
import { callSummaryRequest } from "@/lib/ai/call-summary";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/call-summary-schema";
import { getCases, getTelematics, getVehicle } from "@/lib/customer/vehicles";
import { VIN_PATTERN } from "@/lib/format";

const requestSchema = z.object({
  vin: z.string().toUpperCase().regex(VIN_PATTERN),
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_LENGTH),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { vin, transcript } = parsed.data;

  const [vehicle, cases, telematics] = await Promise.all([getVehicle(vin), getCases(vin), getTelematics(vin, 20)]);
  if (!vehicle) return errorResponse("not_found", 404);

  const result = streamText(callSummaryRequest({ vehicle, cases, telematics }, transcript));

  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
}

// Same shape as the agent route, so the UI maps both the same way (lib/ai-request-error.ts).
function errorResponse(code: "invalid_request" | "not_found", status: number) {
  return Response.json({ error: { code } }, { status });
}
