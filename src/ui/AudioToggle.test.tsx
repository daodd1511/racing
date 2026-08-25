/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioToggle } from "./AudioToggle";

afterEach(cleanup);

describe("AudioToggle", () => {
  it("reports audio changes only after the visible switch changes", async () => {
    const user = userEvent.setup();
    const onMutedChange = vi.fn();
    render(<AudioToggle muted={true} onMutedChange={onMutedChange} />);

    const toggle = screen.getByRole("switch", { name: "Race music" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Muted by default")).toBeTruthy();

    await user.click(toggle);

    expect(onMutedChange).toHaveBeenCalledWith(false);
  });
});
