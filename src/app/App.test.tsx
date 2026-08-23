/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
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
}));

vi.mock("../ui/BroadcastRace", () => ({
  BroadcastRace({
    request,
    snapshot,
    onSnapshot,
    onContact,
    onOutcome,
  }: {
    readonly request: RaceRequest;
    readonly snapshot: RaceSnapshot | null;
    readonly onSnapshot: (snapshot: RaceSnapshot) => void;
    readonly onContact: (event: RaceContactEvent) => void;
    readonly onOutcome: (outcome: RaceOutcome) => void;
  }) {
    function emitSnapshot(): void {
      onSnapshot(broadcastRuntime.snapshot);
    }

    function emitContact(): void {
      onContact(broadcastRuntime.contact);
    }

    function emitOutcome(): void {
      onOutcome(broadcastRuntime.outcome);
    }

    return (
      <section aria-label="Mock live broadcast">
        <output>Race seed {request.seed}</output>
        <output>Race snapshot {snapshot?.elapsedSeconds ?? "pending"}</output>
        <button onClick={emitSnapshot} type="button">
          Emit race snapshot
        </button>
        <button onClick={emitContact} type="button">
          Emit race contact
        </button>
        <button onClick={emitOutcome} type="button">
          Emit race outcome
        </button>
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
    playContact: vi.fn(),
    playFinish: vi.fn(),
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
  vi.restoreAllMocks();
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

    await user.click(screen.getByRole("button", { name: "Start race" }));

    expect(createCourse).toHaveBeenCalledWith(93);
    expect(screen.getByText("Race seed 93")).toBeTruthy();
  });

  it("retains live snapshots and forwards runtime events at the app boundary", async () => {
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

    await user.click(screen.getByRole("button", { name: "Start race" }));
    expect(screen.getByRole("switch", { name: "Race audio" })).toBeTruthy();
    expect(screen.getByText("Race snapshot pending")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Emit race snapshot" }));
    await user.click(screen.getByRole("button", { name: "Emit race contact" }));
    await user.click(screen.getByRole("button", { name: "Emit race outcome" }));

    expect(screen.getByText("Race snapshot 4.2")).toBeTruthy();
    expect(onRaceContact).toHaveBeenCalledWith(broadcastRuntime.contact);
    expect(onRaceOutcome).toHaveBeenCalledWith(broadcastRuntime.outcome);
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
