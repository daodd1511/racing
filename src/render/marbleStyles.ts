export type MarblePattern = "stripe";

export interface MarbleStyle {
  readonly color: string;
  readonly accentColor: string;
  readonly pattern: MarblePattern;
}

const MARBLE_DESIGNS: readonly MarbleStyle[] = [
  { color: "#df3f43", accentColor: "#fff1c7", pattern: "stripe" },
  { color: "#2d6fd2", accentColor: "#f9d95b", pattern: "stripe" },
  { color: "#f4b52f", accentColor: "#20314d", pattern: "stripe" },
  { color: "#228c70", accentColor: "#f5f3df", pattern: "stripe" },
  { color: "#7445a8", accentColor: "#8ce5de", pattern: "stripe" },
  { color: "#e75991", accentColor: "#2b1d4c", pattern: "stripe" },
  { color: "#159fa4", accentColor: "#ffdf70", pattern: "stripe" },
  { color: "#e86f24", accentColor: "#f7f1d8", pattern: "stripe" },
  { color: "#6d8e31", accentColor: "#ff7e59", pattern: "stripe" },
  { color: "#384875", accentColor: "#f18e46", pattern: "stripe" },
  { color: "#ad3f38", accentColor: "#8fd9ee", pattern: "stripe" },
  { color: "#266892", accentColor: "#ffb7c7", pattern: "stripe" },
  { color: "#c7861b", accentColor: "#45305f", pattern: "stripe" },
  { color: "#3f7e58", accentColor: "#ffd4a0", pattern: "stripe" },
  { color: "#7b507a", accentColor: "#d3ef87", pattern: "stripe" },
];

export function marbleStripeBackground(style: MarbleStyle): string {
  return `repeating-linear-gradient(135deg, ${style.color} 0 7px, ${style.accentColor} 7px 11px, ${style.color} 11px 18px)`;
}

export function createMarbleStyles(count: number): MarbleStyle[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Marble style count must be a non-negative safe integer");
  }

  return Array.from({ length: count }, (_, index) => {
    return MARBLE_DESIGNS[index % MARBLE_DESIGNS.length];
  });
}
