import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari13",
    sourcemap: Boolean(process.env.TAURI_DEBUG),
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        preview: fileURLToPath(new URL("./preview.html", import.meta.url)),
        report: fileURLToPath(new URL("./report.html", import.meta.url))
      }
    }
  }
});
