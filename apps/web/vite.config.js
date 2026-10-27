import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/extract-api": {
        target: "http://127.0.0.1:8098",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/extract-api/, "")
      },
      "/ap-api": {
        target: "http://127.0.0.1:8099",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ap-api/, "")
      }
    }
  }
});
