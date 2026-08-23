/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseRoster, SetupScreen, writeRosterToClipboard } from "./SetupScreen";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSetup(overrides: Partial<React.ComponentProps<typeof SetupScreen>> = {}) {
  const props: React.ComponentProps<typeof SetupScreen> = {
    roster: [],
    selectionMode: "first",
    onRosterChange: vi.fn(),
    onSelectionModeChange: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SetupScreen {...props} />) };
}

describe("parseRoster", () => {
  it("trims blank lines while preserving duplicate names", () => {
    expect(parseRoster("  Avery \n\nAvery\n Blake ")).toEqual(["Avery", "Avery", "Blake"]);
  });
});

describe("SetupScreen", () => {
  it("normalizes duplicate names and starts the selected mode", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderSetup();

    await user.type(screen.getByLabelText("Race Roster"), "  Avery \n\nAvery\n Blake ");
    await user.click(screen.getByRole("radio", { name: /^Last finisher/ }));
    rerender(<SetupScreen {...props} selectionMode="last" />);
    await user.click(screen.getByRole("button", { name: "Start race" }));

    expect(props.onRosterChange).toHaveBeenLastCalledWith(["Avery", "Avery", "Blake"]);
    expect(props.onSelectionModeChange).toHaveBeenCalledWith("last");
    expect(props.onStart).toHaveBeenCalledWith({
      roster: ["Avery", "Avery", "Blake"],
      selectionMode: "last",
    });
  });

  it("copies the normalized Roster through the supplied clipboard boundary", async () => {
    const user = userEvent.setup();
    const copyRoster = vi.fn().mockResolvedValue(undefined);
    renderSetup({ roster: [" Avery ", "Blake"], copyRoster });

    await user.click(screen.getByRole("button", { name: "Copy list" }));

    expect(copyRoster).toHaveBeenCalledWith("Avery\nBlake");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("shows validation instead of starting an empty Roster", async () => {
    const user = userEvent.setup();
    const { props } = renderSetup();

    await user.click(screen.getByRole("button", { name: "Start race" }));

    expect(screen.getByText("Add between 1 and 15 non-empty names.")).toBeTruthy();
    expect(props.onStart).not.toHaveBeenCalled();
  });
});

describe("writeRosterToClipboard", () => {
  it("uses the browser Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await writeRosterToClipboard("Avery\nBlake");

    expect(writeText).toHaveBeenCalledWith("Avery\nBlake");
  });
});
