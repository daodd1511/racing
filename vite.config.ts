import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    entries: ["index.html", "preview.html"],
  },
});
