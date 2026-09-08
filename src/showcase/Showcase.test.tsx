/** @vitest-environment happy-dom */

import { Children, isValidElement, useEffect, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Spec } from "../modules/types";
import { loadSavedModuleSettings } from "../assets/settings";
import { Showcase } from "./Showcase";

const observed = vi.hoisted(() => ({
  mounts: 0,
  spec: "",
  feederAuthored: false,
}));

const saved = loadSavedModuleSettings();
const tuned = {
  ...saved,
  chute: { ...saved.chute, length: 0.9 },
};

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => (
    <>
      {Children.toArray(children).filter(
        (child) => isValidElement(child) && typeof child.type !== "string",
      )}
    </>
  ),
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: ReactNode }) => {
    useEffect(() => {
      observed.mounts += 1;
    }, []);
    return children;
  },
}));
vi.mock("@react-three/postprocessing", () => ({
  Bloom: () => null,
  EffectComposer: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../modules/render/ModuleColliders", () => ({
  ModuleColliders: ({ spec }: { spec: Spec }) => {
    observed.spec = JSON.stringify(spec);
    return null;
  },
}));
vi.mock("./CameraFraming", () => ({ CameraFraming: () => null }));
vi.mock("./KinematicClock", () => ({ KinematicClock: () => null }));
vi.mock("./Feeder", () => ({
  Feeder: ({ authored }: { authored: boolean }) => {
    observed.feederAuthored = authored;
    return null;
  },
}));
vi.mock("../assets/render/useAuthoredAssets", () => ({
  useAuthoredAssets: () => ({ state: { status: "ready" }, retry: vi.fn() }),
}));
vi.mock("../dev/ModuleTuningPanel", () => ({
  ModuleTuningPanel: ({ onApply }: { onApply: (settings: typeof tuned) => void }) => (
    <button type="button" onClick={() => onApply(tuned)}>
      Apply test settings
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  observed.mounts = 0;
  observed.spec = "";
  observed.feederAuthored = false;
});

it("keeps captured comparisons distinct from applied settings and restarts the Showcase", async () => {
  render(<Showcase />);
  await screen.findByRole("button", { name: "Apply test settings" });
  const legacy = observed.spec;
  const initialMounts = observed.mounts;

  fireEvent.click(screen.getByRole("button", { name: "Blender baseline" }));
  await waitFor(() => expect(observed.mounts).toBeGreaterThan(initialMounts));
  const authoredBaseline = observed.spec;
  const baselineMounts = observed.mounts;

  fireEvent.click(screen.getByRole("button", { name: "Apply test settings" }));
  await waitFor(() => expect(observed.spec).not.toBe(authoredBaseline));
  await waitFor(() => expect(observed.mounts).toBeGreaterThan(baselineMounts));
  const applied = observed.spec;
  expect(observed.feederAuthored).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Original baseline" }));
  await waitFor(() => expect(observed.spec).toBe(legacy));
  fireEvent.click(screen.getByRole("button", { name: "Blender baseline" }));
  await waitFor(() => expect(observed.spec).toBe(authoredBaseline));
  fireEvent.click(screen.getByRole("button", { name: "Use applied settings" }));
  await waitFor(() => expect(observed.spec).toBe(applied));

  expect(screen.getByRole("heading", { name: "Metrics" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "continuous" })).toBeTruthy();
});
