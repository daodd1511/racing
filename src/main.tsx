import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Showcase } from "./showcase/Showcase";

// Phase 3 points the entry at the Showcase directly -- no router. Spec 4
// decides real routing (setup screen, race, etc); see
// specs/marble-race-rebuild/EXECUTION.md.
const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <Showcase />
  </StrictMode>,
);
