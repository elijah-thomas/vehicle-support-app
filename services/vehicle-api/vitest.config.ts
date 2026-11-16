import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/database-url.js";

// Tests run against a real Postgres: the API's behavior lives in its queries, so mocking Prisma
// would only test the mocks. Locally that's docker-compose; in CI, a service container.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL, RATE_LIMIT_PER_MINUTE: "1200" },
    globalSetup: ["test/global-setup.ts"],
    // One database, and some tests write to it: run files one at a time.
    fileParallelism: false,
  },
});
