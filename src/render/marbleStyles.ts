export type MarblePattern = "solid" | "stripe" | "spot";

export interface MarbleStyle {
  readonly color: string;
  readonly accentColor: string;
  readonly pattern: MarblePattern;
}

const SOLID_PALETTE: readonly MarbleStyle[] = [
  { color: "#e4573f", accentColor: "#fff7e8", pattern: "solid" },
  { color: "#3676d6", accentColor: "#f7f3df", pattern: "solid" },
  { color: "#efbd2d", accentColor: "#17243b", pattern: "solid" },
  { color: "#5eaa79", accentColor: "#fff7e8", pattern: "solid" },
  { color: "#9b62b5", accentColor: "#fff7e8", pattern: "solid" },
  { color: "#e975a4", accentColor: "#17243b", pattern: "solid" },
  { color: "#2faaa2", accentColor: "#fff7e8", pattern: "solid" },
  { color: "#ef872d", accentColor: "#17243b", pattern: "solid" },
  { color: "#8d9d36", accentColor: "#fff7e8", pattern: "solid" },
  { color: "#525a7f", accentColor: "#fff7e8", pattern: "solid" },
];

export function createMarbleStyles(count: number): MarbleStyle[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Marble style count must be a non-negative safe integer");
  }

  return Array.from({ length: count }, (_, index) => {
    const base = SOLID_PALETTE[index % SOLID_PALETTE.length];

    if (index < SOLID_PALETTE.length) {
      return base;
    }

    return {
      ...base,
      pattern: index % 2 === 0 ? "stripe" : "spot",
    };
  });
}
