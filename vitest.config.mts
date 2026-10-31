import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // PGlite(WASM Postgres) 초기화에 몇 초가 걸린다
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
