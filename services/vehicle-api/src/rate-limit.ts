import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "./env.js";

// Decision (D31): one budget per calling system (the ID token's service account), not per IP.
// Why: every rep's traffic arrives from Vercel's shared outbound IPs; limiting each person happens
// at the edge. Trade-off: counters are per instance, so the real ceiling is up to 3×.
// See docs/decisions.md#api-rate-limit-keying
export const rateLimitPerCaller = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => callerEmail(req) ?? ipKeyGenerator(req.ip ?? ""),
});

// Cloud Run IAM has already verified this Google ID token before the request reaches the
// container, so reading its claims here is safe. Locally there is no token; fall back to the IP.
function callerEmail(req: Request): string | undefined {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email?: unknown };
    return typeof claims.email === "string" ? `caller:${claims.email}` : undefined;
  } catch {
    return undefined;
  }
}
