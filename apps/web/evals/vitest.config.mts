import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("..", import.meta.url));
process.loadEnvFile(`${root}.env.local`);

// Evals call real models and the staging API, so they have their own config and only run
// through `pnpm eval`. Env comes from .env.local (`vercel env pull`): staging API + OIDC token.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: root },
      { find: "server-only", replacement: fileURLToPath(new URL("./server-only-stub.ts", import.meta.url)) },
    ],
  },
  test: {
    root,
    include: ["evals/**/*.eval.ts"],
    testTimeout: 120_000,
    maxConcurrency: 8,
    // Print the comparison tables even when every case passes.
    silent: false,
  },
});
