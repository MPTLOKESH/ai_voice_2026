import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The build lands in ../web, the folder the Python server already serves, so `python -m voice_call` runs
// the finished UI with no Node installed. `npm run dev` serves this folder with hot reload instead, and
// passes /api through to the Python server on port 8000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
