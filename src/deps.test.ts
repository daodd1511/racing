import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The Validator drives `@dimforge/rapier3d-compat` directly, because it must
// step raw physics without mounting React (see docs/adr/0002). The runtime
// drives it through `@react-three/rapier`'s bundled copy instead. If those
// two ever resolve to different versions, the Validator validates physics
// the runtime isn't actually running and reports success silently -- so this
// pins them together as a build failure, not a runtime surprise.
//
// `require.resolve` walks Node's real module resolution starting from
// `@react-three/rapier`'s own entry file, so this stays correct even if
// pnpm's hoisting/dedup layout changes -- it reads what would actually be
// imported, not what happens to sit in node_modules today.
const require = createRequire(import.meta.url);

function readPackageVersion(entryFilePath: string, packageName: string): string {
  let dir = dirname(entryFilePath);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === packageName && typeof pkg.version === "string") {
        return pkg.version;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json for ${packageName} above ${entryFilePath}`);
    }
    dir = parent;
  }
}

describe("@dimforge/rapier3d-compat version pin", () => {
  it("matches the version @react-three/rapier resolves internally", () => {
    const packageName = "@dimforge/rapier3d-compat";

    const directEntry = require.resolve(packageName);
    const directVersion = readPackageVersion(directEntry, packageName);

    const r3fRapierEntry = require.resolve("@react-three/rapier");
    const nestedEntry = require.resolve(packageName, { paths: [r3fRapierEntry] });
    const nestedVersion = readPackageVersion(nestedEntry, packageName);

    expect(directVersion).toBe(nestedVersion);
  });
});
