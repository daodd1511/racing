import { useState } from "react";

import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { CameraMode, SelectionMode } from "../race/types";

export interface SetupRaceInput {
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
  readonly cameraMode: CameraMode;
}

export interface SetupScreenProps {
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
  readonly cameraMode?: CameraMode;
  readonly onRosterChange: (roster: readonly string[]) => void;
  readonly onSelectionModeChange: (selectionMode: SelectionMode) => void;
  readonly onCameraModeChange?: (cameraMode: CameraMode) => void;
  readonly onStart: (input: SetupRaceInput) => void;
  readonly copyRoster?: (value: string) => Promise<void>;
}

function CameraOption({
  mode,
  title,
  detail,
  cameraMode,
  onCameraModeChange,
}: {
  readonly mode: CameraMode;
  readonly title: string;
  readonly detail: string;
  readonly cameraMode: CameraMode;
  readonly onCameraModeChange?: (cameraMode: CameraMode) => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    if (event.currentTarget.checked) {
      onCameraModeChange?.(mode);
    }
  }

  return (
    <label className="setup-screen__mode-option">
      <input
        checked={cameraMode === mode}
        name="camera-mode"
        onChange={handleChange}
        type="radio"
        value={mode}
      />
      <span className="setup-screen__mode-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </label>
  );
}

type CopyState = "idle" | "copied" | "unavailable";

function isValidRoster(roster: readonly string[]): boolean {
  return roster.length >= 1 && roster.length <= DEFAULT_RACE_CONFIG.maximumRosterSize;
}

export function parseRoster(value: string): readonly string[] {
  return Object.freeze(
    value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
}

function copyLabel(copyState: CopyState): string {
  switch (copyState) {
    case "copied":
      return "Copied";
    case "unavailable":
      return "Copy unavailable";
    case "idle":
      return "Copy list";
  }
}

export async function writeRosterToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function ModeOption({
  mode,
  title,
  detail,
  selectionMode,
  onSelectionModeChange,
}: {
  readonly mode: SelectionMode;
  readonly title: string;
  readonly detail: string;
  readonly selectionMode: SelectionMode;
  readonly onSelectionModeChange: (selectionMode: SelectionMode) => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    if (event.currentTarget.checked) {
      onSelectionModeChange(mode);
    }
  }

  return (
    <label className="setup-screen__mode-option">
      <input
        checked={selectionMode === mode}
        name="selection-mode"
        onChange={handleChange}
        type="radio"
        value={mode}
      />
      <span className="setup-screen__mode-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </label>
  );
}

export function SetupScreen({
  roster,
  selectionMode,
  cameraMode = "broadcast",
  onRosterChange,
  onSelectionModeChange,
  onCameraModeChange,
  onStart,
  copyRoster = writeRosterToClipboard,
}: SetupScreenProps) {
  const [rosterInput, setRosterInput] = useState(() => roster.join("\n"));
  const [showValidation, setShowValidation] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const normalizedRoster = parseRoster(rosterInput);
  const validRoster = isValidRoster(normalizedRoster);
  const maximumRosterSize = DEFAULT_RACE_CONFIG.maximumRosterSize;
  const countText = `${normalizedRoster.length} / ${maximumRosterSize} marbles`;
  const validationMessage = `Add between 1 and ${maximumRosterSize} non-empty names.`;
  const copyButtonLabel = copyLabel(copyState);
  const fillRatio = Math.min(1, normalizedRoster.length / maximumRosterSize);

  function handleRosterChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    const value = event.currentTarget.value;
    setRosterInput(value);
    setShowValidation(true);
    setCopyState("idle");
    onRosterChange(parseRoster(value));
  }

  function handleCopy(): void {
    if (!validRoster) {
      setShowValidation(true);
      return;
    }

    void copyRoster(normalizedRoster.join("\n")).then(
      () => setCopyState("copied"),
      () => setCopyState("unavailable"),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setShowValidation(true);
    if (!validRoster) {
      return;
    }
    onStart({ roster: normalizedRoster, selectionMode, cameraMode });
  }

  return (
    <main className="setup-screen">
      <section aria-labelledby="setup-title" className="setup-screen__card">
        <div className="setup-screen__content">
          <p className="setup-screen__eyebrow">Load the hopper</p>
          <h1 id="setup-title">Ready, set, pick.</h1>
          <p className="setup-screen__intro">
            One name per marble. The Course stays physical and the result stays in this browser.
          </p>
          <form className="setup-screen__form" onSubmit={handleSubmit}>
            <div className="setup-screen__field">
              <label className="setup-screen__label" htmlFor="race-roster">
                Race Roster
              </label>
              <textarea
                aria-describedby="roster-count roster-validation"
                aria-invalid={showValidation && !validRoster}
                id="race-roster"
                maxLength={1200}
                name="roster"
                onChange={handleRosterChange}
                placeholder={"Avery\nBlake\nCasey"}
                rows={5}
                value={rosterInput}
              />
              <div className="setup-screen__roster-footer">
                <span className="setup-screen__count" id="roster-count">
                  <span aria-hidden="true" className="setup-screen__meter">
                    <span
                      className="setup-screen__meter-fill"
                      style={{ width: `${(fillRatio * 100).toFixed(1)}%` }}
                    />
                  </span>
                  {countText}
                </span>
                <button className="setup-screen__copy" onClick={handleCopy} type="button">
                  {copyButtonLabel}
                </button>
              </div>
            </div>
            <div className="setup-screen__settings">
              <fieldset className="setup-screen__modes">
                <legend className="setup-screen__label">Who should be selected?</legend>
                <div className="setup-screen__mode-options">
                  <ModeOption
                    detail="End when one marble crosses Finish."
                    mode="first"
                    onSelectionModeChange={onSelectionModeChange}
                    selectionMode={selectionMode}
                    title="First finisher"
                  />
                  <ModeOption
                    detail="Race until the final marble reaches Finish."
                    mode="last"
                    onSelectionModeChange={onSelectionModeChange}
                    selectionMode={selectionMode}
                    title="Last finisher"
                  />
                </div>
              </fieldset>
              <fieldset className="setup-screen__modes">
                <legend className="setup-screen__label">Camera</legend>
                <div className="setup-screen__mode-options">
                  <CameraOption
                    cameraMode={cameraMode}
                    detail="Elevated view with more Course visible."
                    mode="broadcast"
                    onCameraModeChange={onCameraModeChange}
                    title="Broadcast"
                  />
                  <CameraOption
                    cameraMode={cameraMode}
                    detail="Track-level view directly above the marbles."
                    mode="close-up"
                    onCameraModeChange={onCameraModeChange}
                    title="Close up"
                  />
                </div>
              </fieldset>
            </div>
            <p
              aria-live="polite"
              className="setup-screen__validation"
              id="roster-validation"
              role="status"
            >
              {showValidation && !validRoster ? validationMessage : ""}
            </p>
            <button className="setup-screen__start" type="submit">
              Release the marbles
            </button>
          </form>
        </div>
        <div aria-hidden="true" className="setup-screen__marbles">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
