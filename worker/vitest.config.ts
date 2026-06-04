import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Tests de integración contra Supabase remoto: dale margen de tiempo.
    testTimeout: 20000,
    hookTimeout: 20000,
    // BD compartida entre archivos: correrlos en paralelo causa interferencia
    // (un archivo limpia/consume los jobs de otro). Secuencial obligatorio.
    fileParallelism: false,
  },
});
