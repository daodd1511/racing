/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Course } from "../course/types";
import type { RaceRequest } from "../race/liveTypes";
import { loadSavedModuleSettings } from "../assets/settings";
import { CoursePreview, CourseControls, FIXED_ROSTER, raceStatus } from "./coursePreview";

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

  it("keeps the Course review harness isolated from production and Showcase entries", () => {
    const productionEntry = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const showcaseEntry = readFileSync(resolve(process.cwd(), "src/dev/showcase.tsx"), "utf8");

    expect(productionEntry).toContain('from "./app/App"');
    expect(productionEntry).not.toContain("CoursePreview");
    expect(showcaseEntry).toContain('from "../showcase/Showcase"');
    expect(showcaseEntry).not.toContain("CoursePreview");
  });
});

const live = vi.hoisted(() => ({
  current: null as { course: Course; request: RaceRequest } | null,
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) =>
    Children.toArray(children).filter(
      (child) => isValidElement(child) && typeof child.type !== "string",
    ),
}));
vi.mock("../assets/render/useAuthoredAssets", () => ({
  useAuthoredAssets: () => ({ state: { status: "ready" }, retry: vi.fn() }),
}));
vi.mock("../race/CourseMinimap", () => ({ CourseMinimap: () => null }));
vi.mock("../race/LiveRace", () => ({
  LiveRace: ({ course, request }: { course: Course; request: RaceRequest }) => {
    live.current = { course, request };
    return null;
  },
}));
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("restarts every shared Module only on apply and keeps the active race identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async (_url, init) =>
          new Response(
            JSON.stringify(
              init?.method === "PUT"
                ? { revision: "b".repeat(64), settings: JSON.parse(init.body).settings }
                : { revision: "a".repeat(64), settings: loadSavedModuleSettings() },
            ),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
  );
  render(<CoursePreview />);
  const restart = await screen.findByRole("button", { name: "Restart with draft" });
  await waitFor(() => expect(restart.hasAttribute("disabled")).toBe(false));
  const initial = live.current!.course;
  fireEvent.change(screen.getByRole("slider", { name: "Length (m)" }), {
    target: { value: "0.9" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Seed" }), { target: { value: "42" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Selection mode" }), {
    target: { value: "first" },
  });
  expect(live.current!.course).toBe(initial);
  fireEvent.click(restart);
  const applied = live.current!.course;
  expect(applied.seed).toBe(7);
  expect(live.current!.request.selectionMode).toBe("last");
  expect(live.current!.request.roster).toEqual(FIXED_ROSTER);
  expect(
    applied.modules
      .filter((module) => module.moduleId === "chute")
      .every((module) => module.params.length === 0.9),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save settings" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  expect(live.current!.course).toBe(applied);
  fireEvent.click(screen.getByRole("button", { name: "Blender baseline" }));
  fireEvent.click(screen.getByRole("button", { name: "Start or restart" }));
  const baseline = live.current!.course;
  expect(
    baseline.modules
      .filter((module) => module.moduleId === "chute")
      .every((module) => module.params.length === 0.6),
  ).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "Module" }), {
    target: { value: "pin-field" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "Post spacing (m)" }), {
    target: { value: "0.2" },
  });
  fireEvent.click(restart);
  expect(screen.getByRole("alert").textContent).toContain("rail gaps");
  expect(live.current!.course).toBe(baseline);
});
