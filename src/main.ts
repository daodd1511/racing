import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Application root is missing");
}

root.innerHTML = "<main>Marble Race Picker simulation foundation</main>";
