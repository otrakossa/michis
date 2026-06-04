import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Tests de integración contra Supabase remoto: dale margen de tiempo.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
