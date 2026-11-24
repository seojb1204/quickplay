import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.QP_API_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": api,
      "/socket.io": { target: api, ws: true },
    },
  },
  build: { target: "es2022", sourcemap: true },
});
