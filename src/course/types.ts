import type { ParamValues } from "../modules/params";
import type { Anchor, Footprint, Role, Spec } from "../modules/types";
import type { Quaternion, Vector3 } from "../race/types";

export interface BoardSpec {
  readonly columns: number;
  readonly rows: number;
  readonly cellPitch: number;
  readonly bayWidth: number;
  readonly bayHeight: number;
  readonly edgeMargin: number;
  readonly bounds: Footprint["bounds"];
}

interface ArcSlotBase {
  readonly slotIndex: number;
  readonly column: number;
  readonly row: number;
  readonly direction: "left" | "right";
}

export interface FixedArcSlot extends ArcSlotBase {
  readonly kind: "start" | "finish";
}

export interface ModuleArcSlot extends ArcSlotBase {
  readonly kind: "module";
  readonly role: Role;
}

export type ArcSlot = FixedArcSlot | ModuleArcSlot;

export interface CoursePlacement {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface PlacedModule {
  readonly slotIndex: number;
  readonly role: Role;
  readonly moduleId: string;
  readonly params: ParamValues;
  readonly placement: CoursePlacement;
  readonly spec: Spec;
}

export interface CourseConnector {
  readonly id: string;
  readonly fromSlotIndex: number;
  readonly toSlotIndex: number;
  readonly spec: Spec;
}

export interface CourseCheckpoint {
  readonly slotIndex: number;
  readonly anchor: Anchor;
  readonly routeDistance: number;
}

export interface Course {
  readonly seed: number;
  readonly board: BoardSpec;
  readonly modules: readonly PlacedModule[];
  readonly connectors: readonly CourseConnector[];
  readonly route: readonly Vector3[];
  readonly checkpoints: readonly CourseCheckpoint[];
  readonly start: Spec;
  readonly finish: Spec;
  readonly entry: Anchor;
  readonly exit: Anchor;
}
