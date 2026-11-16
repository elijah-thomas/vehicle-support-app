import express from "express";
import type { AddressInfo } from "node:net";
import { expect, test, vi } from "vitest";

// A tiny limit, so the budgets are visible in a few requests.
vi.stubEnv("RATE_LIMIT_PER_MINUTE", "2");

// An unsigned token with only the claim the limiter reads. Cloud Run verifies real ones.
const tokenFor = (email: string) =>
  `Bearer x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.signature`;

test("each calling service account gets its own budget", async () => {
  const { rateLimitPerCaller } = await import("../src/rate-limit.js");
  const app = express().use(rateLimitPerCaller).get("/", (_req, res) => void res.send("ok"));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const statuses = async (authorization?: string) => {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(url, { headers: authorization ? { authorization } : {} })).status);
    return codes;
  };

  expect(await statuses(tokenFor("web@project.iam.gserviceaccount.com"))).toEqual([200, 200, 429]);
  expect(await statuses(tokenFor("other-system@project.iam.gserviceaccount.com"))).toEqual([200, 200, 429]);
  expect(await statuses()).toEqual([200, 200, 429]);
  server.close();
});
