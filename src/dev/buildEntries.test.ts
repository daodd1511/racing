import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readEntry(name: "index.html" | "showcase.html" | "course.html"): string {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

describe("Vite entry pages", () => {
  it("builds production and development pages from distinct named inputs", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfig).toContain('base: "./"');
    expect(viteConfig).toContain('index: resolve(ROOT_DIRECTORY, "index.html")');
    expect(viteConfig).toContain('showcase: resolve(ROOT_DIRECTORY, "showcase.html")');
    expect(viteConfig).toContain('course: resolve(ROOT_DIRECTORY, "course.html")');
    expect(viteConfig).toContain('entries: ["index.html", "showcase.html", "course.html"]');
  });

  it("routes each page to its intended entry module", () => {
    expect(readEntry("index.html")).toContain('src="/src/main.tsx"');
    expect(readEntry("showcase.html")).toContain('src="/src/dev/showcase.tsx"');
    expect(readEntry("course.html")).toContain('src="/src/dev/coursePreview.tsx"');
  });
});

it("removes the tuning editor imports from production viewer transforms", async () => {
  const { transformWithOxc, minify } = await import("vite");
  for (const path of ["src/dev/coursePreview.tsx", "src/showcase/Showcase.tsx"]) {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const transformed = await transformWithOxc(source, path, {
      define: { "import.meta.env.DEV": "false" },
    });
    const output = await minify(path.replace(".tsx", ".js"), transformed.code, { compress: true });
    expect(output.code).not.toContain('import("./ModuleTuningPanel")');
    expect(output.code).not.toContain('import("../dev/ModuleTuningPanel")');
    expect(output.code).not.toContain("moduleSettingsClient");
    expect(output.code).not.toContain("/__dev/module-settings");
  }
});
