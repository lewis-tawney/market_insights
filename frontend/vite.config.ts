import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      // Proxy frontend dev requests to the FastAPI server
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Keep parity with nginx: strip the /api prefix when proxying
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
