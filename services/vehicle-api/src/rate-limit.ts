import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "./env.js";

// One budget per calling system, not per IP: every rep's traffic reaches this API from Vercel's
// shared outbound IPs. Limiting each person happens at the edge (Vercel Firewall).
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
