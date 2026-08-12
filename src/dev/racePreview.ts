import "../styles/race.css";

import type { SelectionMode } from "../race/types";
import { initializeRapier } from "../simulation/initializeRapier";
import { simulateRace } from "../simulation/simulateRace";
import { createRaceView, type RaceView } from "../ui/createRaceView";

const DEFAULT_ROSTER = ["Avery", "Blake", "Casey", "Devon", "Emery"];

function parseRoster(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .slice(0, 15);
}

function appendLabeledControl(
  form: HTMLFormElement,
  labelText: string,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): void {
  const label = document.createElement("label");
  label.textContent = labelText;
  label.htmlFor = control.id;
  form.append(label, control);
}

function createControlPanel(): {
  readonly panel: HTMLElement;
  readonly form: HTMLFormElement;
  readonly seed: HTMLInputElement;
  readonly mode: HTMLSelectElement;
  readonly roster: HTMLTextAreaElement;
  readonly notice: HTMLParagraphElement;
} {
  const panel = document.createElement("aside");
  panel.className = "preview-controls";
  const heading = document.createElement("h1");
  heading.textContent = "Race tuning harness";
  const note = document.createElement("p");
  note.textContent = "Runs the production physics recording and 30-second replay.";
  const form = document.createElement("form");
  const seed = document.createElement("input");
  seed.id = "preview-seed";
  seed.name = "seed";
  seed.type = "number";
  seed.value = "0";
  seed.required = true;
  const mode = document.createElement("select");
  mode.id = "preview-mode";
  mode.name = "mode";
  for (const [value, label] of [
    ["first", "First finisher"],
    ["last", "Last finisher"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  const roster = document.createElement("textarea");
  roster.id = "preview-roster";
  roster.name = "roster";
  roster.rows = 5;
  roster.value = DEFAULT_ROSTER.join("\n");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Run this seed";
  const notice = document.createElement("p");
  notice.className = "preview-notice";
  appendLabeledControl(form, "Seed", seed);
  appendLabeledControl(form, "Selection", mode);
  appendLabeledControl(form, "Roster (one name per line)", roster);
  form.append(submit, notice);
  panel.append(heading, note, form);

  return { panel, form, seed, mode, roster, notice };
}

const root = document.querySelector<HTMLDivElement>("#preview-app");

if (root === null) {
  throw new Error("Preview root is missing");
}

root.className = "preview-page";
const controls = createControlPanel();
const raceMount = document.createElement("div");
raceMount.className = "preview-race-mount";
root.append(controls.panel, raceMount);

let currentView: RaceView | undefined;
await initializeRapier();

function runPreview(): void {
  const roster = parseRoster(controls.roster.value);
  const seed = Number(controls.seed.value);
  const mode = controls.mode.value as SelectionMode;

  if (!Number.isSafeInteger(seed) || roster.length === 0) {
    controls.notice.textContent = "Enter an integer seed and at least one name.";
    return;
  }

  currentView?.dispose();
  controls.notice.textContent = "Simulating this fixed seed…";
  const recording = simulateRace(roster, seed, mode);

  if (recording === null) {
    controls.notice.textContent = "This seed did not complete within 60 simulated seconds.";
    raceMount.replaceChildren();
    return;
  }

  controls.notice.textContent = `Recorded ${recording.simulationDurationSeconds.toFixed(2)} simulated seconds.`;
  currentView = createRaceView(raceMount, recording);
  currentView.start();
}

controls.form.addEventListener("submit", (event) => {
  event.preventDefault();
  runPreview();
});

runPreview();
