import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const analyze = mode === "analyze";

  return {
    plugins: [
      react(),
      tailwindcss(),
      analyze &&
        visualizer({
          filename: "artifacts/bundle-stats.html",
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
        }),
      analyze &&
        visualizer({
          filename: "artifacts/bundle-stats.json",
          gzipSize: true,
          brotliSize: true,
          template: "raw-data",
        }),
    ],
    build: {
      target: "es2020",
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@solana") || id.includes("bn.js") || id.includes("bs58")) return "solana";
            if (id.includes("gsap") || id.includes("@gsap/react")) return "motion-gsap";
            if (id.includes("lucide-react")) return "icons";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
