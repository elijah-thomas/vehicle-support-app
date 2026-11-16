// Our AI routes answer errors with { error: { code } }. The chat transport puts that body in
// error.message and the status in statusCode; useObject gives only the body, so the call summary
// tags rate limits itself (see rateLimitAwareFetch). A 429 comes from the Firewall, whose body
// isn't ours. See docs/decisions.md#error-states
export type AiErrorCode = "rate_limited" | "too_long" | "invalid_request" | "not_found" | "incomplete" | "failed";

const known = new Set<AiErrorCode>(["rate_limited", "too_long", "invalid_request", "not_found", "incomplete"]);

export function aiErrorCode(error: Error): AiErrorCode {
  if ("statusCode" in error && error.statusCode === 429) return "rate_limited";
  try {
    const code = (JSON.parse(error.message) as { error?: { code?: string } }).error?.code;
    return code && known.has(code as AiErrorCode) ? (code as AiErrorCode) : "failed";
  } catch {
    return "failed";
  }
}

export const rateLimitedBody = JSON.stringify({ error: { code: "rate_limited" } });

// For useObject: replaces the Firewall's 429 page with our error shape.
export const rateLimitAwareFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  return response.status === 429 ? new Response(rateLimitedBody, { status: 429 }) : response;
};
