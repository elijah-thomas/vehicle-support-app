import type { AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";
import { app } from "../src/app.js";

let baseUrl = "";

// Starts the real Express app on a random port for the test file that imports this.
export function useApi() {
  let server: ReturnType<typeof app.listen>;
  beforeAll(() => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
}

export async function call(path: string, init?: RequestInit & { json?: unknown }) {
  const { json, ...rest } = init ?? {};
  const response = await fetch(baseUrl + path, {
    ...rest,
    headers: { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const body: any = await response.json().catch(() => null);
  return { status: response.status, body };
}

// Read tests rely on the seed as-is; write tests only touch Marcus's case and Jordan's truck.
export const VIN = {
  dana: "0MRAE4LR5RA100001",
  marcus: "0MRKC15V8PA200002",
  priya: "0MRSH25H1TA300003",
  jordanTruck: "0MRKW15T6MA400005",
};
