/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CourseControls, FIXED_ROSTER, raceStatus } from "./coursePreview";

describe("CoursePreview", () => {
  it("keeps the fixed 15-marble roster and exposes labelled controls", () => {
    const markup = renderToStaticMarkup(
      <CourseControls
        onSeedChange={vi.fn()}
        onSelectionModeChange={vi.fn()}
        onStart={vi.fn()}
        seed={42}
        selectionMode="last"
      />,
    );

    document.body.innerHTML = markup;
    expect(FIXED_ROSTER).toHaveLength(15);
    expect(new Set(FIXED_ROSTER)).toHaveLength(15);
    expect(document.querySelector("label")?.textContent).toContain("Seed");
    expect(document.querySelector("select")?.value).toBe("last");
    expect(document.querySelector("button")?.textContent).toBe("Start or restart");
  });

  it("reports ready, completed, and watchdog states", () => {
    expect(raceStatus(null, null)).toBe("Ready to race");
    expect(
      raceStatus(null, {
        kind: "completed",
        elapsedSeconds: 9.876,
        finalRanking: [0],
        finishOrder: [0],
        seed: 7,
        selectedMarbleIndex: 0,
      }),
    ).toBe("Completed in 9.88 seconds");
    expect(
      raceStatus(null, {
        kind: "watchdog",
        elapsedSeconds: 120,
        seed: 7,
        unfinishedMarbleIndices: [1, 2],
      }),
    ).toBe("Watchdog at 120.00 seconds; 2 unfinished");
  });

  it("leaves the Showcase entry isolated from the development harness", () => {
    const showcaseEntry = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

    expect(showcaseEntry).toContain('from "./showcase/Showcase"');
    expect(showcaseEntry).not.toContain("CoursePreview");
  });
});
