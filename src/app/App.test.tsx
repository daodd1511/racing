/** @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RaceAudio } from "../audio/createRaceAudio";
import type { Course } from "../course/types";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { CommittedRaceRecord, PickerSettingsV1, PickerStateV1 } from "../race/types";
import type { RaceStore } from "../storage/raceStore";
import { App } from "./App";

const broadcastRuntime = vi.hoisted(() => ({
  renderCount: 0,
  snapshot: Object.freeze({
    elapsedSeconds: 4.2,
    marbleTransforms: Object.freeze([]),
    ranking: Object.freeze([1, 0]),
    decisiveMarbleIndex: 1,
    passedCheckpoints: Object.freeze([0, 1]),
    splitTimes: Object.freeze([Object.freeze([1.1]), Object.freeze([1.2])]),
  }),
  contact: Object.freeze({ elapsedSeconds: 4.2, marbleIndices: Object.freeze([0]), impulse: 2 }),
  outcome: Object.freeze({
    kind: "completed" as const,
    seed: 93,
    selectedMarbleIndex: 1,
    finishOrder: Object.freeze([1]),
    finalRanking: Object.freeze([1, 0]),
    elapsedSeconds: 4.2,
  }),
  watchdog: Object.freeze({
    kind: "watchdog" as const,
    seed: 93,
    unfinishedMarbleIndices: Object.freeze([0]),
    elapsedSeconds: 120,
  }),
}));

vi.mock("../ui/BroadcastRace", () => ({
  BroadcastRace({
    request,
    snapshot,
    frozen = false,
    onSnapshot,
    onContact,
    onOutcome,
  }: {
    readonly request: RaceRequest;
    readonly snapshot: RaceSnapshot | null;
    readonly frozen?: boolean;
    readonly onSnapshot: (snapshot: RaceSnapshot) => void;
    readonly onContact?: (event: RaceContactEvent) => void;
    readonly onOutcome: (outcome: RaceOutcome) => void;
  }) {
    broadcastRuntime.renderCount += 1;
    function emitSnapshot(): void {
      onSnapshot(broadcastRuntime.snapshot);
    }

    function emitContact(): void {
      onContact?.(broadcastRuntime.contact);
    }

    function emitOutcome(): void {
      onOutcome(broadcastRuntime.outcome);
    }

    function emitDuplicateOutcomes(): void {
      onOutcome(broadcastRuntime.outcome);
      onOutcome(broadcastRuntime.outcome);
    }

    function emitWatchdog(): void {
      onOutcome(broadcastRuntime.watchdog);
    }

    return (
      <section aria-label="Mock live broadcast">
        <output>Race seed {request.seed}</output>
        <output>Race snapshot {snapshot?.elapsedSeconds ?? "pending"}</output>
        {frozen ? <output>Frozen race</output> : null}
        {frozen ? null : (
          <>
            <button onClick={emitSnapshot} type="button">
              Emit race snapshot
            </button>
            <button onClick={emitContact} type="button">
              Emit race contact
            </button>
            <button onClick={emitOutcome} type="button">
              Emit race outcome
            </button>
            <button onClick={emitDuplicateOutcomes} type="button">
              Emit duplicate outcomes
            </button>
            <button onClick={emitWatchdog} type="button">
              Emit watchdog
            </button>
          </>
        )}
      </section>
    );
  },
}));

class MemoryRaceStore implements RaceStore {
  private state: PickerStateV1;

  constructor(state: PickerStateV1) {
    this.state = state;
  }

  load(): PickerStateV1 {
    return this.state;
  }

  saveRoster(roster: readonly string[]): PickerStateV1 {
    this.state = Object.freeze({ ...this.state, roster: Object.freeze([...roster]) });
    return this.state;
  }

  saveSettings(settings: PickerSettingsV1): PickerStateV1 {
    this.state = Object.freeze({ ...this.state, settings: Object.freeze({ ...settings }) });
    return this.state;
  }

  appendCommittedRace(record: CommittedRaceRecord): PickerStateV1 {
    this.state = Object.freeze({
      ...this.state,
      history: Object.freeze([...this.state.history, record]),
    });
    return this.state;
  }
}

function createAudioMock(): RaceAudio {
  return {
    isMuted: vi.fn(() => true),
    setMuted: vi.fn(async () => undefined),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    dispose: vi.fn(),
  };
}

function createStore(): MemoryRaceStore {
  return new MemoryRaceStore({
    version: 1,
    roster: ["Avery", "Blake"],
    settings: { selectionMode: "last" },
    history: [],
  });
}

afterEach(() => {
  cleanup();
  broadcastRuntime.renderCount = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("App", () => {
  it("loads the saved setup and persists valid Roster and Selection Mode edits", async () => {
    const user = userEvent.setup();
    const store = createStore();
    const saveRoster = vi.spyOn(store, "saveRoster");
    const saveSettings = vi.spyOn(store, "saveSettings");
    render(<App createAudio={createAudioMock} store={store} />);

    expect((screen.getByLabelText("Race Roster") as HTMLTextAreaElement).value).toBe(
      "Avery\nBlake",
    );
    expect(
      screen.getByRole("radio", { name: /^Last finisher/ }).getAttribute("checked"),
    ).not.toBeNull();

    await user.clear(screen.getByLabelText("Race Roster"));
    await user.type(screen.getByLabelText("Race Roster"), "Casey");
    await user.click(screen.getByRole("radio", { name: /^First finisher/ }));

    expect(saveRoster).toHaveBeenLastCalledWith(["Casey"]);
    expect(saveSettings).toHaveBeenCalledWith({ selectionMode: "first" });
  });

  it("creates one seeded Course request on setup confirmation", async () => {
    const user = userEvent.setup();
    const createCourse = vi.fn((seed: number) => Object.freeze({ seed }) as Course);
    render(
      <App
        createAudio={createAudioMock}
        createCourse={createCourse}
        createSeed={() => 93}
        store={createStore()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Release the marbles" }));

    expect(createCourse).toHaveBeenCalledWith(93);
    expect(screen.getByText("Race seed 93")).toBeTruthy();
  });

  it("retains live snapshots without rerendering the app and forwards runtime events", async () => {
    const user = userEvent.setup();
    const onRaceContact = vi.fn();
    const onRaceOutcome = vi.fn();
    render(
      <App
        createAudio={createAudioMock}
        createCourse={(seed) => Object.freeze({ seed }) as Course}
        createSeed={() => 93}
        onRaceContact={onRaceContact}
        onRaceOutcome={onRaceOutcome}
        store={createStore()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Release the marbles" }));
    expect(screen.getByRole("switch", { name: "Race music" })).toBeTruthy();
    expect(screen.getByText("Race snapshot pending")).toBeTruthy();
    const renderCountBeforeSnapshot = broadcastRuntime.renderCount;

    await user.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    await user.click(screen.getByRole("button", { name: "Emit race contact" }));

    expect(screen.getByText("Race snapshot pending")).toBeTruthy();
    expect(broadcastRuntime.renderCount).toBe(renderCountBeforeSnapshot);
    expect(onRaceContact).toHaveBeenCalledWith(broadcastRuntime.contact);

    await user.click(screen.getByRole("button", { name: "Emit race outcome" }));

    expect(onRaceOutcome).toHaveBeenCalledWith(broadcastRuntime.outcome);
  });

  it("commits and freezes one completed race before revealing its result", () => {
    vi.useFakeTimers();
    const store = createStore();
    const appendCommittedRace = vi.spyOn(store, "appendCommittedRace");
    const audio = createAudioMock();
    render(
      <StrictMode>
        <App
          createAudio={() => audio}
          createCourse={(seed) => Object.freeze({ seed }) as Course}
          createSeed={() => 93}
          store={store}
        />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Release the marbles" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit race contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit duplicate outcomes" }));

    expect(audio.startMusic).toHaveBeenCalledWith(
      expect.objectContaining({ id: "arcade-style-game" }),
    );
    expect(appendCommittedRace).toHaveBeenCalledOnce();
    expect(appendCommittedRace).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 93,
        selectedName: "Blake",
        finishOrder: [1],
        finalRanking: [1, 0],
      }),
    );
    expect(audio.stopMusic).toHaveBeenCalledOnce();
    expect(screen.getByText("Frozen race")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Blake" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByRole("heading", { name: "Blake" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New race" }));

    expect(screen.getByLabelText("Race Roster")).toBeTruthy();
  });

  it("keeps watchdog outcomes out of history and offers both recovery paths", async () => {
    const user = userEvent.setup();
    const store = createStore();
    const appendCommittedRace = vi.spyOn(store, "appendCommittedRace");
    const createCourse = vi.fn((seed: number) => Object.freeze({ seed }) as Course);
    const seedValues = [93, 94];
    render(
      <App
        createAudio={createAudioMock}
        createCourse={createCourse}
        createSeed={() => seedValues.shift() ?? 95}
        store={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Release the marbles" }));
    await user.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    await user.click(screen.getByRole("button", { name: "Emit watchdog" }));

    expect(appendCommittedRace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Race needs attention" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry race" }));
    expect(createCourse).toHaveBeenLastCalledWith(94);
    expect(screen.getByText("Race seed 94")).toBeTruthy();
  });

  it("returns a watchdog session to the saved setup without appending history", async () => {
    const user = userEvent.setup();
    const store = createStore();
    const appendCommittedRace = vi.spyOn(store, "appendCommittedRace");
    render(
      <App
        createAudio={createAudioMock}
        createCourse={(seed) => Object.freeze({ seed }) as Course}
        createSeed={() => 93}
        store={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Release the marbles" }));
    await user.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    await user.click(screen.getByRole("button", { name: "Emit watchdog" }));
    await user.click(screen.getByRole("button", { name: "Back to setup" }));

    expect(appendCommittedRace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Race Roster")).toBeTruthy();
  });

  it("cancels a pending reveal when the app unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <App
        createAudio={createAudioMock}
        createCourse={(seed) => Object.freeze({ seed }) as Course}
        createSeed={() => 93}
        store={createStore()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Release the marbles" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit race outcome" }));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("creates and disposes audio safely across Strict Mode remounts", () => {
    const audioInstances: RaceAudio[] = [];
    const createAudio = vi.fn(() => {
      const audio = createAudioMock();
      audioInstances.push(audio);
      return audio;
    });
    const { unmount } = render(
      <StrictMode>
        <App createAudio={createAudio} store={createStore()} />
      </StrictMode>,
    );

    unmount();

    expect(createAudio).toHaveBeenCalledTimes(2);
    expect(
      audioInstances.every(
        (audio) => (audio.dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      ),
    ).toBe(true);
  });
});
