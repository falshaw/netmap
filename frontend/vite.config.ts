import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // In production nginx injects X-API-Key when proxying /api. The dev server
  // does the same from the API_KEY environment variable (or frontend/.env).
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: {
      port: 3021,
      host: true,
      proxy: {
        "/api": {
          target: env.NETMAP_API_URL || "http://127.0.0.1:8021",
          changeOrigin: true,
          headers: env.API_KEY ? { "X-API-Key": env.API_KEY } : undefined,
        },
      },
    },
  };
});
