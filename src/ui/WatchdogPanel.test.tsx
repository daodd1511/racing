/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WatchdogPanel } from "./WatchdogPanel";

afterEach(cleanup);

describe("WatchdogPanel", () => {
  it("identifies unfinished marbles without result language", () => {
    render(
      <WatchdogPanel
        onBackToSetup={vi.fn()}
        onRetryRace={vi.fn()}
        outcome={{
          kind: "watchdog",
          seed: 77,
          unfinishedMarbleIndices: [0, 2],
          elapsedSeconds: 120,
        }}
        request={{ seed: 77, roster: ["Avery", "Blake", "Casey"], selectionMode: "first" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Race needs attention" })).toBeTruthy();
    expect(screen.getByText("77")).toBeTruthy();
    expect(screen.getByText("02:00.00")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Unfinished marbles" })).toBeTruthy();
    expect(screen.getByRole("list").textContent).toContain("Avery");
    expect(screen.getByRole("list").textContent).toContain("Casey");
    expect(screen.queryByText("Winner")).toBeNull();
  });

  it("offers explicit retry and setup recovery actions", async () => {
    const user = userEvent.setup();
    const onRetryRace = vi.fn();
    const onBackToSetup = vi.fn();
    render(
      <WatchdogPanel
        onBackToSetup={onBackToSetup}
        onRetryRace={onRetryRace}
        outcome={{ kind: "watchdog", seed: 2, unfinishedMarbleIndices: [0], elapsedSeconds: 120 }}
        request={{ seed: 2, roster: ["Avery"], selectionMode: "first" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry race" }));
    await user.click(screen.getByRole("button", { name: "Back to setup" }));

    expect(onRetryRace).toHaveBeenCalledOnce();
    expect(onBackToSetup).toHaveBeenCalledOnce();
  });
});
