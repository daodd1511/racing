import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Relative base so the built assets resolve correctly at a GitHub Pages
  // repository subpath (https://<owner>.github.io/<repo>/) without hardcoding
  // the repository name here.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(ROOT_DIRECTORY, "index.html"),
        showcase: resolve(ROOT_DIRECTORY, "showcase.html"),
        course: resolve(ROOT_DIRECTORY, "course.html"),
      },
    },
  },
  optimizeDeps: {
    entries: ["index.html", "showcase.html", "course.html"],
  },
});
