import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./database-url.js";

// Apply migrations (creating the database if needed), then load the synthetic seed stories.
export default function setup() {
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync("pnpm exec prisma migrate deploy", { env, stdio: "inherit" });
  execSync("pnpm db:seed", { env, stdio: "inherit" });
}
