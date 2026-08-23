import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Showcase } from "../showcase/Showcase";

const root = document.querySelector<HTMLDivElement>("#app");

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Showcase />
    </StrictMode>,
  );
}
