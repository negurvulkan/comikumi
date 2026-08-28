import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // onnxruntime-web (client/src/ocr/) loads its WASM backend by fetching these
    // files at a runtime-configured URL (see worker.ts's ort.env.wasm.wasmPaths) —
    // they must be plain static files, not run through Vite's normal JS/asset
    // pipeline (which would hash/transform them and break onnxruntime-web's own
    // internal filename expectations).
    // Known follow-up: Vite's own build-time static analysis of ocr/worker.ts's
    // `import * as ort from "onnxruntime-web"` still additionally pulls one wasm
    // variant into the hashed dist/assets/ output (~27MB) via onnxruntime-web's own
    // internal import.meta.url asset reference — harmless at runtime (worker.ts's
    // explicit ort.env.wasm.wasmPaths always wins over whatever Vite bundled), just
    // wasted build size/time. Properly externalizing onnxruntime-web from the
    // worker's own Rollup build (not just optimizeDeps, which only affects the
    // dev-server pre-bundler) would need worker-specific build.rollupOptions —
    // deferred, not required for correctness.
    viteStaticCopy({
      targets: [{ src: "node_modules/onnxruntime-web/dist/*.{wasm,mjs}", dest: "ort", rename: { stripBase: true } }],
    }),
  ],
  // onnxruntime-web ships pre-built WASM + its own dynamic-import/worker loading —
  // Vite's dev-time pre-bundler (esbuild) doesn't need to (and shouldn't) touch it.
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
