import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts", "src/core/types.ts"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 85,
        statements: 85,
      },
    },
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
    },
  },
});
