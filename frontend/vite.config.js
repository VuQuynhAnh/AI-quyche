import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api sang backend Node.js khi chạy dev, để frontend gọi thẳng "/api/..."
// mà không bị lỗi CORS trong lúc phát triển.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
