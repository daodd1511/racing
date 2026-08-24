/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RACE_CONFIG } from "../race/config";
import { ResultPanel } from "./ResultPanel";

afterEach(cleanup);

describe("ResultPanel", () => {
  it("presents the configured result, selected marble, race data, and observed orders", () => {
    render(
      <ResultPanel
        finalRanking={[1, 0, 2]}
        finishOrder={[1, 0]}
        onNewRace={vi.fn()}
        request={{ seed: 91, roster: ["Avery", "Blake", "Casey"], selectionMode: "last" }}
        selectedMarbleIndex={1}
        snapshot={{
          elapsedSeconds: 64.2,
          marbleTransforms: [],
          ranking: [1, 0, 2],
          decisiveMarbleIndex: 1,
          passedCheckpoints: [3, 3, 2],
          splitTimes: [
            [1.2, 2.6],
            [1.1, 2.2],
            [1.4, null],
          ],
        }}
      />,
    );

    expect(screen.getByText(DEFAULT_RACE_CONFIG.resultLabel)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Blake" })).toBeTruthy();
    expect(
      screen.getByLabelText("Selected marble: Blake, stripe pattern").getAttribute("style"),
    ).toContain("repeating-linear-gradient");
    expect(screen.getByText("91")).toBeTruthy();
    expect(screen.getByText("Last finisher")).toBeTruthy();
    expect(screen.getByText("01:04.20")).toBeTruthy();

    expect(screen.getByLabelText("Finish order").textContent).toContain("Blake");
    expect(screen.getByLabelText("Finish order").textContent).toContain("Avery");
    expect(screen.getByLabelText("Final ranking").textContent).toContain("Casey");
  });

  it("starts a new race only from the explicit action", async () => {
    const user = userEvent.setup();
    const onNewRace = vi.fn();
    render(
      <ResultPanel
        finalRanking={[0]}
        finishOrder={[0]}
        onNewRace={onNewRace}
        request={{ seed: 2, roster: ["Avery"], selectionMode: "first" }}
        selectedMarbleIndex={0}
        snapshot={{
          elapsedSeconds: 2,
          marbleTransforms: [],
          ranking: [0],
          decisiveMarbleIndex: 0,
          passedCheckpoints: [1],
          splitTimes: [[2]],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New race" }));

    expect(onNewRace).toHaveBeenCalledOnce();
  });
});
