import type { RaceSnapshot } from "./liveTypes";
import type { Vector3 } from "./types";

export interface DecisiveMarbleTarget {
  readonly marbleIndex: number;
  readonly position: Vector3;
}

/** Returns the immutable transform the standings and minimap identify as decisive. */
export function decisiveMarbleTarget(snapshot: RaceSnapshot): DecisiveMarbleTarget | null {
  const marble = snapshot.marbleTransforms.find(
    ({ marbleIndex }) => marbleIndex === snapshot.decisiveMarbleIndex,
  );
  if (marble === undefined) {
    return null;
  }

  return Object.freeze({ marbleIndex: marble.marbleIndex, position: marble.position });
}
