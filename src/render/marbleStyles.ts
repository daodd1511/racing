export type MarblePattern = "ribbon" | "orbit" | "confetti" | "diamond" | "split";

export interface MarbleStyle {
  readonly color: string;
  readonly accentColor: string;
  readonly pattern: MarblePattern;
}

const MARBLE_DESIGNS: readonly MarbleStyle[] = [
  { color: "#df3f43", accentColor: "#fff1c7", pattern: "ribbon" },
  { color: "#2d6fd2", accentColor: "#f9d95b", pattern: "orbit" },
  { color: "#f4b52f", accentColor: "#20314d", pattern: "diamond" },
  { color: "#228c70", accentColor: "#f5f3df", pattern: "split" },
  { color: "#7445a8", accentColor: "#8ce5de", pattern: "confetti" },
  { color: "#e75991", accentColor: "#2b1d4c", pattern: "orbit" },
  { color: "#159fa4", accentColor: "#ffdf70", pattern: "ribbon" },
  { color: "#e86f24", accentColor: "#f7f1d8", pattern: "diamond" },
  { color: "#6d8e31", accentColor: "#ff7e59", pattern: "confetti" },
  { color: "#384875", accentColor: "#f18e46", pattern: "split" },
  { color: "#ad3f38", accentColor: "#8fd9ee", pattern: "orbit" },
  { color: "#266892", accentColor: "#ffb7c7", pattern: "confetti" },
  { color: "#c7861b", accentColor: "#45305f", pattern: "ribbon" },
  { color: "#3f7e58", accentColor: "#ffd4a0", pattern: "diamond" },
  { color: "#7b507a", accentColor: "#d3ef87", pattern: "split" },
];

export function createMarbleStyles(count: number): MarbleStyle[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Marble style count must be a non-negative safe integer");
  }

  return Array.from({ length: count }, (_, index) => {
    return MARBLE_DESIGNS[index % MARBLE_DESIGNS.length];
  });
}
