import { createMarbleStyles } from "../render/marbleStyles";
import type { CommittedRaceRecord } from "../race/types";

export interface ResultDialog {
  onNewRace(listener: () => void): () => void;
  dispose(): void;
}

export function createResultDialog(
  root: HTMLElement,
  record: CommittedRaceRecord,
  label: string,
): ResultDialog {
  const listeners = new Set<() => void>();
  const styles = createMarbleStyles(record.roster.length);
  const overlay = document.createElement("section");
  overlay.className = "result-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "result-heading");
  const ticket = document.createElement("div");
  ticket.className = "result-ticket";
  const banner = document.createElement("p");
  banner.className = "result-banner";
  banner.textContent = label;
  const heading = document.createElement("h2");
  heading.id = "result-heading";
  heading.textContent = record.selectedName;
  const marble = document.createElement("span");
  marble.className = "marble-token marble-token--result";
  marble.style.setProperty("--marble-color", styles[record.selectedMarbleIndex].color);
  marble.style.setProperty("--marble-accent", styles[record.selectedMarbleIndex].accentColor);
  marble.dataset.pattern = styles[record.selectedMarbleIndex].pattern;
  marble.setAttribute("aria-hidden", "true");
  const detail = document.createElement("p");
  detail.className = "result-detail";
  detail.textContent = `${record.selectionMode === "first" ? "First across" : "Final arrival"} · seed ${record.seed}`;
  const order = document.createElement("ol");
  order.className = "result-finish-order";
  record.finishOrder.forEach((marbleIndex, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${record.roster[marbleIndex]}`;
    order.append(item);
  });
  const newRace = document.createElement("button");
  newRace.className = "result-new-race";
  newRace.type = "button";
  newRace.textContent = "Set up a new race";
  ticket.append(banner, marble, heading, detail, order, newRace);
  overlay.append(ticket);
  root.append(overlay);

  const onNewRace = (): void => listeners.forEach((listener) => listener());
  newRace.addEventListener("click", onNewRace);
  newRace.focus();

  return {
    onNewRace(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      newRace.removeEventListener("click", onNewRace);
      overlay.remove();
    },
  };
}
