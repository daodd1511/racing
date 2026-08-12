import "./styles/app.css";

import { createApp } from "./app/createApp";
const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Application root is missing");
}

createApp(root);
