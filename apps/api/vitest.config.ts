import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Tests share a real Postgres database — run files sequentially
    fileParallelism: false,
  },
});
