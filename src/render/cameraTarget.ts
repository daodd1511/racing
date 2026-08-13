import type { MarbleTransform, SelectionMode, Vector3 } from "../race/types";
import type { TrackDefinition } from "../track/definition";
import { measureTrackProgress, sampleTrackPath } from "../track/progress";

export interface CameraTarget {
  readonly marbleIndex: number;
  readonly position: Vector3;
  readonly lookAt: Vector3;
}

export function cameraDampingAlpha(deltaSeconds: number): number {
  const boundedDelta = Math.max(0, Math.min(0.05, deltaSeconds));
  return 1 - Math.exp(-boundedDelta * 3.8);
}

export function selectCameraTargetIndex(
  transforms: readonly MarbleTransform[],
  track: TrackDefinition,
  mode: SelectionMode,
): number {
  if (transforms.length === 0) {
    throw new RangeError("Camera tracking requires at least one marble transform");
  }

  let selectedIndex = 0;
  let selectedProgress = measureTrackProgress(track, transforms[0].position);
  for (let index = 1; index < transforms.length; index += 1) {
    const progress = measureTrackProgress(track, transforms[index].position);
    const replacesTarget =
      mode === "first" ? progress > selectedProgress : progress < selectedProgress;
    if (replacesTarget) {
      selectedIndex = index;
      selectedProgress = progress;
    }
  }

  return selectedIndex;
}

export function createCameraTarget(
  transforms: readonly MarbleTransform[],
  track: TrackDefinition,
  mode: SelectionMode,
): CameraTarget {
  const marbleIndex = selectCameraTargetIndex(transforms, track, mode);
  const marblePosition = transforms[marbleIndex].position;
  const progress = measureTrackProgress(track, marblePosition);
  const pathSample = sampleTrackPath(track, progress);
  const position: Vector3 = [
    marblePosition[0] - pathSample.tangent[0] * 8,
    marblePosition[1] + 11,
    marblePosition[2] - pathSample.tangent[2] * 8,
  ];
  const lookAt: Vector3 = [
    marblePosition[0] + pathSample.tangent[0] * 5,
    marblePosition[1],
    marblePosition[2] + pathSample.tangent[2] * 5,
  ];

  return { marbleIndex, position, lookAt };
}
