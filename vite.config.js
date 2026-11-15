import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: { input: ["index.html", "angler.html"] },
    chunkSizeWarningLimit: 4000, // Spark is a large library
  },
});
