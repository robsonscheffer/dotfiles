import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const entry = process.env.ENTRY;

const entries = {
  showcase: {
    root: resolve(__dirname, "src"),
    input: resolve(__dirname, "src/showcase.html"),
    outDir: resolve(__dirname, "dist"),
  },
  spec: {
    root: resolve(__dirname, "src/templates"),
    input: resolve(__dirname, "src/templates/spec.html"),
    outDir: resolve(__dirname, "dist/templates"),
  },
  report: {
    root: resolve(__dirname, "src/templates"),
    input: resolve(__dirname, "src/templates/report.html"),
    outDir: resolve(__dirname, "dist/templates"),
  },
  prototype: {
    root: resolve(__dirname, "src/templates"),
    input: resolve(__dirname, "src/templates/prototype.html"),
    outDir: resolve(__dirname, "dist/templates"),
  },
  dashboard: {
    root: resolve(__dirname, "src/templates"),
    input: resolve(__dirname, "src/templates/dashboard.html"),
    outDir: resolve(__dirname, "dist/templates"),
  },
};

const current = entries[entry] || entries.showcase;

export default defineConfig({
  root: current.root,
  plugins: [tailwindcss(), viteSingleFile()],
  build: {
    outDir: current.outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: current.input,
    },
  },
});
