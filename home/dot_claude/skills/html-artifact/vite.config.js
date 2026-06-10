import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        showcase: resolve(__dirname, "src/showcase.html"),
        spec: resolve(__dirname, "src/templates/spec.html"),
        report: resolve(__dirname, "src/templates/report.html"),
        prototype: resolve(__dirname, "src/templates/prototype.html"),
        dashboard: resolve(__dirname, "src/templates/dashboard.html"),
      },
    },
  },
});
