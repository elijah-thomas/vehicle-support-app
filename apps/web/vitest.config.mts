import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: no network, no model calls. Evals have their own config (evals/vitest.config.mts).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
      { find: "server-only", replacement: fileURLToPath(new URL("./evals/server-only-stub.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "evals/**", ".next/**"],
  },
});
