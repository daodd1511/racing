/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PickerStateV1 } from "../race/types";
import { createSetupView } from "./createSetupView";

const INITIAL_STATE: PickerStateV1 = {
  version: 1,
  roster: [],
  settings: { selectionMode: "first" },
  history: [],
};

describe("createSetupView", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("normalizes duplicate roster names and starts the selected mode", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const view = createSetupView(root, INITIAL_STATE);
    const onStart = vi.fn();
    view.onStart(onStart);
    const roster = root.querySelector<HTMLTextAreaElement>("#race-roster");
    const lastMode = root.querySelector<HTMLInputElement>('input[value="last"]');
    const form = root.querySelector<HTMLFormElement>("form");

    if (roster === null || lastMode === null || form === null) {
      throw new Error("Expected setup controls");
    }
    roster.value = "  Avery \n\nAvery\n Blake ";
    roster.dispatchEvent(new Event("input", { bubbles: true }));
    lastMode.checked = true;
    lastMode.dispatchEvent(new Event("change", { bubbles: true }));
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(onStart).toHaveBeenCalledWith({
      roster: ["Avery", "Avery", "Blake"],
      selectionMode: "last",
    });
  });

  it("copies the normalized list through the browser clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const root = document.createElement("div");
    document.body.append(root);
    createSetupView(root, { ...INITIAL_STATE, roster: [" Avery ", "Blake"] });
    const copyButton = root.querySelector<HTMLButtonElement>(".setup-copy-button");

    if (copyButton === null) {
      throw new Error("Expected copy button");
    }
    copyButton.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("Avery\nBlake");
  });
});
