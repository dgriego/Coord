import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WEB_PORT and API_PORT let a second checkout (a git worktree) run beside the first.
const api = `http://localhost:${process.env.API_PORT ?? 8790}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target: api, changeOrigin: false },
      // Client share pages are rendered by the API.
      "/p/": { target: api, changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
