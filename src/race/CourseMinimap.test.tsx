/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BOARD } from "../course/board";
import { assembleCourse } from "../course/assembleCourse";
import { CourseMinimap } from "./CourseMinimap";

describe("CourseMinimap", () => {
  it("renders every marble and identifies the decisive marble without color alone", () => {
    const course = assembleCourse(7);
    const markup = renderToStaticMarkup(
      <CourseMinimap
        board={BOARD}
        course={course}
        roster={["Avery", "Blake", "Casey"]}
        snapshot={{
          elapsedSeconds: 1,
          marbleTransforms: [
            { marbleIndex: 0, position: [-1, 1, 0], rotation: [0, 0, 0, 1] },
            { marbleIndex: 1, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
            { marbleIndex: 2, position: [1, -1, 0], rotation: [0, 0, 0, 1] },
          ],
          ranking: [2, 1, 0],
          decisiveMarbleIndex: 1,
          passedCheckpoints: [0, 0, 0],
          splitTimes: [[], [], []],
        }}
      />,
    );

    document.body.innerHTML = markup;
    expect(document.querySelectorAll(".course-minimap__marble")).toHaveLength(3);
    expect(document.querySelectorAll("pattern")).toHaveLength(3);
    expect(
      [...document.querySelectorAll(".course-minimap__marble")].every((marble) =>
        marble.getAttribute("fill")?.startsWith("url(#"),
      ),
    ).toBe(true);
    expect(document.querySelector(".course-minimap__marble--decisive")?.tagName).toBe("path");
    expect(document.body.textContent).toContain("Decisive: Blake");
    expect(document.querySelector("svg")?.getAttribute("aria-label")).toBe("Course minimap");
  });
});
