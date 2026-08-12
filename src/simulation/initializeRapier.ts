import RAPIER from "@dimforge/rapier3d-compat";

let initialization: Promise<void> | undefined;

export function initializeRapier(): Promise<void> {
  initialization ??= RAPIER.init();

  return initialization;
}
