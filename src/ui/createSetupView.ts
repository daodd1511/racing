import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { PickerStateV1, SelectionMode } from "../race/types";

export interface SetupRaceInput {
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
}

export interface SetupView {
  onStart(listener: (input: SetupRaceInput) => void): () => void;
  onRosterChange(listener: (roster: readonly string[]) => void): () => void;
  onSettingsChange(listener: (selectionMode: SelectionMode) => void): () => void;
  dispose(): void;
}

function parseRoster(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function isSelectionMode(value: unknown): value is SelectionMode {
  return value === "first" || value === "last";
}

function createModeOption(
  mode: SelectionMode,
  title: string,
  detail: string,
  selected: boolean,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "setup-mode-option";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "selection-mode";
  input.value = mode;
  input.checked = selected;
  const copy = document.createElement("span");
  copy.className = "setup-mode-copy";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const description = document.createElement("span");
  description.textContent = detail;
  copy.append(heading, description);
  label.append(input, copy);

  return label;
}

function createMarbleDecoration(): HTMLDivElement {
  const decoration = document.createElement("div");
  decoration.className = "setup-marble-cluster";

  for (const index of [0, 1, 2, 3, 4]) {
    const marble = document.createElement("span");
    marble.className = "setup-decoration-marble";
    marble.style.setProperty("--cluster-index", String(index));
    decoration.append(marble);
  }

  return decoration;
}

export function createSetupView(root: HTMLElement, initial: PickerStateV1): SetupView {
  const startListeners = new Set<(input: SetupRaceInput) => void>();
  const rosterListeners = new Set<(roster: readonly string[]) => void>();
  const settingsListeners = new Set<(selectionMode: SelectionMode) => void>();
  const shell = document.createElement("main");
  shell.className = "setup-page";
  const header = document.createElement("header");
  header.className = "setup-header";
  const brand = document.createElement("a");
  brand.className = "setup-brand";
  brand.href = "/";
  brand.textContent = "Marble Mayhem";
  const status = document.createElement("p");
  status.className = "setup-status-stamp";
  status.textContent = "Local-only picker";
  header.append(brand, status);

  const card = document.createElement("section");
  card.className = "setup-card";
  const content = document.createElement("div");
  content.className = "setup-content";
  const eyebrow = document.createElement("p");
  eyebrow.className = "setup-eyebrow";
  eyebrow.textContent = "Load the hopper";
  const heading = document.createElement("h1");
  heading.textContent = "Pick a person by letting the marbles decide.";
  const intro = document.createElement("p");
  intro.className = "setup-intro";
  intro.textContent =
    "One name per marble. The course is physical; the result stays in this browser.";
  const form = document.createElement("form");
  form.className = "setup-form";
  const rosterLabel = document.createElement("label");
  rosterLabel.className = "setup-field-label";
  rosterLabel.htmlFor = "race-roster";
  rosterLabel.textContent = "Race roster";
  const roster = document.createElement("textarea");
  roster.id = "race-roster";
  roster.name = "roster";
  roster.rows = 8;
  roster.maxLength = 1_200;
  roster.placeholder = "Avery\nBlake\nCasey";
  roster.value = initial.roster.join("\n");
  const rosterFooter = document.createElement("div");
  rosterFooter.className = "setup-roster-footer";
  const rosterCount = document.createElement("span");
  rosterCount.className = "setup-roster-count";
  const copyButton = document.createElement("button");
  copyButton.className = "setup-copy-button";
  copyButton.type = "button";
  copyButton.textContent = "Copy list";
  rosterFooter.append(rosterCount, copyButton);

  const modeLabel = document.createElement("p");
  modeLabel.className = "setup-field-label";
  modeLabel.textContent = "Who should be selected?";
  const modes = document.createElement("fieldset");
  modes.className = "setup-mode-options";
  modes.append(
    createModeOption(
      "first",
      "First finisher",
      "End the race the instant one marble crosses.",
      initial.settings.selectionMode === "first",
    ),
    createModeOption(
      "last",
      "Last finisher",
      "Keep racing until the final marble arrives.",
      initial.settings.selectionMode === "last",
    ),
  );
  const error = document.createElement("p");
  error.className = "setup-validation";
  error.setAttribute("role", "alert");
  const startButton = document.createElement("button");
  startButton.className = "setup-start-button";
  startButton.type = "submit";
  startButton.textContent = "Release the marbles";
  form.append(rosterLabel, roster, rosterFooter, modeLabel, modes, error, startButton);
  content.append(eyebrow, heading, intro, form);
  card.append(content, createMarbleDecoration());
  shell.append(header, card);
  root.replaceChildren(shell);

  let showValidation = false;

  function updateRosterFeedback(): readonly string[] {
    const normalized = parseRoster(roster.value);
    rosterCount.textContent = `${normalized.length} / ${DEFAULT_RACE_CONFIG.maximumRosterSize} marbles`;
    const isValid =
      normalized.length >= 1 && normalized.length <= DEFAULT_RACE_CONFIG.maximumRosterSize;
    roster.setAttribute("aria-invalid", String(showValidation && !isValid));
    error.textContent =
      showValidation && !isValid
        ? `Add between 1 and ${DEFAULT_RACE_CONFIG.maximumRosterSize} non-empty names.`
        : "";
    return normalized;
  }

  function selectedMode(): SelectionMode {
    const selected = form.querySelector<HTMLInputElement>('input[name="selection-mode"]:checked');

    if (selected === null || !isSelectionMode(selected.value)) {
      throw new Error("A selection mode must be selected");
    }

    return selected.value;
  }

  const onRosterInput = (): void => {
    showValidation = true;
    const normalized = updateRosterFeedback();
    if (normalized.length >= 1 && normalized.length <= DEFAULT_RACE_CONFIG.maximumRosterSize) {
      rosterListeners.forEach((listener) => listener(Object.freeze([...normalized])));
    }
  };
  const onModeChange = (event: Event): void => {
    const target = event.target;
    const selectionMode = target instanceof HTMLInputElement ? target.value : undefined;
    if (
      !(target instanceof HTMLInputElement) ||
      !target.checked ||
      !isSelectionMode(selectionMode)
    ) {
      return;
    }
    settingsListeners.forEach((listener) => listener(selectionMode));
  };
  const onCopy = async (): Promise<void> => {
    const normalized = updateRosterFeedback();
    if (normalized.length === 0) {
      showValidation = true;
      updateRosterFeedback();
      error.textContent = "Add at least one name before copying.";
      return;
    }

    try {
      await navigator.clipboard.writeText(normalized.join("\n"));
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Copy unavailable";
    }
  };
  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    showValidation = true;
    const normalized = updateRosterFeedback();
    if (normalized.length < 1 || normalized.length > DEFAULT_RACE_CONFIG.maximumRosterSize) {
      return;
    }
    startListeners.forEach((listener) =>
      listener({ roster: Object.freeze([...normalized]), selectionMode: selectedMode() }),
    );
  };

  roster.addEventListener("input", onRosterInput);
  modes.addEventListener("change", onModeChange);
  copyButton.addEventListener("click", onCopy);
  form.addEventListener("submit", onSubmit);
  updateRosterFeedback();

  return {
    onStart(listener) {
      startListeners.add(listener);
      return () => startListeners.delete(listener);
    },
    onRosterChange(listener) {
      rosterListeners.add(listener);
      return () => rosterListeners.delete(listener);
    },
    onSettingsChange(listener) {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    dispose() {
      roster.removeEventListener("input", onRosterInput);
      modes.removeEventListener("change", onModeChange);
      copyButton.removeEventListener("click", onCopy);
      form.removeEventListener("submit", onSubmit);
      root.replaceChildren();
    },
  };
}
