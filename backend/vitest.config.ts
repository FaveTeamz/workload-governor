import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globals: true,
    setupFiles: ["./src/__tests__/offline.setup.ts"],
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
