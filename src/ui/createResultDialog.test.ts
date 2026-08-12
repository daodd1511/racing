/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createResultDialog } from "./createResultDialog";

describe("createResultDialog", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows the selected marble, observed order, and only leaves through new race", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dialog = createResultDialog(
      root,
      {
        seed: 42,
        committedAtEpochMs: 100,
        roster: ["Avery", "Blake"],
        selectionMode: "last",
        selectedMarbleIndex: 1,
        selectedName: "Blake",
        finishOrder: [0, 1],
        finalRanking: [0, 1],
      },
      "Last finisher",
    );
    const onNewRace = vi.fn();
    dialog.onNewRace(onNewRace);

    expect(root.textContent).toContain("Blake");
    expect(root.textContent).toContain("seed 42");
    expect(root.querySelectorAll(".result-finish-order li")).toHaveLength(2);
    root.querySelector<HTMLButtonElement>(".result-new-race")?.click();

    expect(onNewRace).toHaveBeenCalledOnce();
  });
});
