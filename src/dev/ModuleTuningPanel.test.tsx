/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadSavedModuleSettings } from "../assets/settings";
import { ModuleTuningPanel } from "./ModuleTuningPanel";

vi.mock("../assets/render/useAuthoredAssets", () => ({
  useAuthoredAssets: () => ({ state: { status: "ready" }, retry: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const snapshot = (revision = "a".repeat(64)) => ({ revision, settings: loadSavedModuleSettings() });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
it("keeps draft edits unapplied and saves without restarting", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(snapshot()))
    .mockImplementationOnce(async (_url, init) => {
      const payload = JSON.parse(String(init!.body));
      expect(payload.expectedRevision).toBe("a".repeat(64));
      expect(payload.settings.chute.length).toBe(0.9);
      return json({ revision: "b".repeat(64), settings: payload.settings });
    });
  vi.stubGlobal("fetch", fetch);
  const apply = vi.fn();
  render(<ModuleTuningPanel applied={null} onApply={apply} />);
  const restart = screen.getByRole("button", { name: "Restart with draft" });
  await waitFor(() => expect(restart.hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByRole("slider", { name: "Length (m)" }), {
    target: { value: "0.9" },
  });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await screen.findByText(/Draft saved/);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(restart);
  expect(apply).toHaveBeenCalledOnce();
  expect(apply.mock.calls[0][0].chute.length).toBe(0.9);
});
it("preserves a stale draft and requires an explicit revision reload before another save", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(snapshot()))
    .mockResolvedValueOnce(json({ error: "Settings changed" }, 409))
    .mockResolvedValueOnce(json(snapshot("b".repeat(64))))
    .mockImplementationOnce(async (_url, init) => {
      const payload = JSON.parse(String(init!.body));
      expect(payload.expectedRevision).toBe("b".repeat(64));
      expect(payload.settings.chute.length).toBe(0.9);
      return json({ revision: "c".repeat(64), settings: payload.settings });
    });
  vi.stubGlobal("fetch", fetch);
  render(<ModuleTuningPanel applied={null} onApply={vi.fn()} />);
  const save = screen.getByRole("button", { name: "Save settings" });
  await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByRole("slider", { name: "Length (m)" }), {
    target: { value: "0.9" },
  });
  fireEvent.click(save);
  await screen.findByText(/Your draft is preserved/);
  expect(screen.getByRole("status").textContent).toContain("Saved revision changed");
  expect(save.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved revision" }));
  await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
  expect((screen.getByRole("slider", { name: "Length (m)" }) as HTMLInputElement).value).toBe(
    "0.9",
  );
  fireEvent.click(save);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
});
it("rejects an unusable draft before replacing the active geometry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(snapshot())));
  const apply = vi.fn();
  render(<ModuleTuningPanel applied={null} onApply={apply} />);
  const restart = screen.getByRole("button", { name: "Restart with draft" });
  await waitFor(() => expect(restart.hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByRole("combobox", { name: "Module" }), {
    target: { value: "pin-field" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "Post spacing (m)" }), {
    target: { value: "0.2" },
  });
  fireEvent.click(restart);
  expect(screen.getByRole("alert").textContent).toContain("rail gaps");
  expect(apply).not.toHaveBeenCalled();
});
