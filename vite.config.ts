import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "esnext", // SurrealDB-WASM uses top-level await + BigInt literals
  },
  // Both packages ship their own WASM and resolve it via `new URL(..., import.meta.url)`.
  // Vite's dep-optimizer rewrites import.meta.url so the WASM path no longer points
  // anywhere real — excluding them keeps the original module layout intact.
  optimizeDeps: {
    exclude: ["@surrealdb/wasm", "oxigraph", "surrealdb"],
    esbuildOptions: { target: "esnext" },
  },
  // Treat WASM as a real asset (not text) when imported with `?url`.
  assetsInclude: ["**/*.wasm"],
});
