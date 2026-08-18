import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built assets resolve correctly at a GitHub Pages
  // repository subpath (https://<owner>.github.io/<repo>/) without hardcoding
  // the repository name here.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    entries: ["index.html", "preview.html"],
  },
});
