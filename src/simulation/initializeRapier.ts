import RAPIER from "@dimforge/rapier3d-compat";

let initialization: Promise<void> | undefined;
let isInitialized = false;

export function initializeRapier(): Promise<void> {
  initialization ??= RAPIER.init().then(() => {
    isInitialized = true;
  });

  return initialization;
}

export function assertRapierInitialized(): void {
  if (!isInitialized) {
    throw new Error("Call and await initializeRapier() before simulating a race");
  }
}
