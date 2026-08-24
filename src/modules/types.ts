import type { Quaternion, Vector3 } from "../race/types";

// The Module contract -- see PLAN.md -> "The Module contract" and
// docs/adr/0002-live-physics-with-headless-validation.md. `buildSpec` must
// be a pure function of `params`: same input, deep-equal output, every call.
// It is the single source of truth both the live R3F renderer (Phase 3's
// `<ModuleColliders>`) and the headless Validator consume -- if it reaches
// for React state, a ref, or `Math.random()`, the Validator starts
// validating a different world than the one that ships.
//
// This file intentionally imports nothing from `three` or React: a Module's
// geometry is plain data, so the Validator (which drives raw
// `@dimforge/rapier3d-compat`, never React) can consume it with zero
// rendering-library coupling.

/** What a Module does to the field of marbles. The Arc (Spec 3) is written
 * in Roles, not in Modules -- see CONTEXT.md -> "Role". */
export type Role = "accel" | "scatter" | "shuffle" | "sort";

/** One position on the Board's hole grid -- see CONTEXT.md -> "Cell". Plain
 * integer grid coordinates; the Board/Assembler (Spec 3) interprets them. */
export interface Cell {
  readonly column: number;
  readonly row: number;
}

/** A local coordinate frame: where a path enters or exits a Module, and
 * which way it's heading. `tangent` and `up` must be unit vectors. */
export interface Anchor {
  readonly position: Vector3;
  readonly tangent: Vector3;
  readonly up: Vector3;
}

/** The Cells a Module occupies plus its entry and exit Anchors -- everything
 * the Assembler needs to place it and connect it. See CONTEXT.md ->
 * "Footprint". `bounds` is an axis-aligned box in the Module's local space,
 * for camera framing and quick overlap checks ahead of the precise Cell set. */
export interface Footprint {
  readonly cells: readonly Cell[];
  readonly entry: Anchor;
  readonly exit: Anchor;
  /** Ordered local-space centreline from `entry` to `exit`. Progress,
   * connectivity checks, and the minimap all consume this same path rather
   * than reconstructing one from rendered geometry. */
  readonly route: readonly Vector3[];
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 };
}

/** Geometric primitives a Module can be built from. Shared by `ColliderSpec`
 * and `VisualSpec`: for most Modules the collision volume and the drawn mesh
 * are the same box/cylinder/ball, so one union serves both rather than
 * duplicating shape math per concern. `trimesh` supports smooth visual
 * surfaces while physics can use simpler colliders. */
export type Shape =
  | { readonly kind: "cuboid"; readonly halfExtents: Vector3 }
  | { readonly kind: "cylinder"; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: "ball"; readonly radius: number }
  | {
      readonly kind: "trimesh";
      readonly vertices: readonly number[];
      readonly indices: readonly number[];
    };

export interface ColliderMaterial {
  readonly restitution: number;
  readonly friction: number;
}

/** Pure rotational motion a Module's `step` can evaluate from its Spec.
 * `axis` must be unit length and `pivot` is in the Module's local space. */
export interface KinematicRotationMotion {
  readonly kind: "rotation";
  readonly axis: Vector3;
  readonly pivot: Vector3;
  readonly angularVelocity: number;
}

export interface ColliderSpec {
  /** Stable within one Spec; `KinematicTransform.id` targets this to move a
   * specific collider without touching the rest. */
  readonly id: string;
  /** A position-based kinematic body. Omitted or false keeps the collider
   * fixed in both the live R3F world and the headless Validator. */
  readonly kinematic?: boolean;
  /** Finite overlap detector consumed by Course worlds. Module colliders
   * omit it and remain solid. */
  readonly sensor?: boolean;
  /** Optional pure motion data for a kinematic collider. The shared Module
   * `step` reads it from the Spec rather than retaining runtime state. */
  readonly motion?: KinematicRotationMotion;
  readonly shape: Shape;
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly material: ColliderMaterial;
}

export interface VisualMaterial {
  /** CSS/hex color, passed straight to a `meshStandardMaterial` in Phase 3. */
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
}

export interface VisualSpec {
  readonly id: string;
  readonly shape: Shape;
  readonly material: VisualMaterial;
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

/** The pure output of `buildSpec`: everything needed to build both a raw
 * Rapier world (the Validator) and a rendered scene (the runtime), and
 * nothing that only one of those two consumers needs. */
export interface Spec {
  readonly colliders: readonly ColliderSpec[];
  readonly footprint: Footprint;
  readonly visuals: readonly VisualSpec[];
}

export interface NumberParamField {
  readonly kind: "number";
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export interface BooleanParamField {
  readonly kind: "boolean";
  readonly key: string;
  readonly label: string;
  readonly default: boolean;
}

export type ParamField = NumberParamField | BooleanParamField;

/** Describes a Module's params so the Showcase's `ParamPanel` (Phase 3) can
 * generate controls generically -- no Module ships its own hand-written
 * panel. */
export interface ParamSchema {
  readonly fields: readonly ParamField[];
}

export interface ModuleMeta {
  readonly name: string;
  readonly tags?: readonly string[];
  readonly params: ParamSchema;
}

/** One collider or visual's transform at a point in time, keyed by
 * `ColliderSpec.id`/`VisualSpec.id`. Omitted fields mean "unchanged". */
export interface KinematicTransform {
  readonly id: string;
  readonly position?: Vector3;
  readonly rotation?: Quaternion;
}

export interface ModuleDefinition<P> {
  readonly id: string;
  readonly role: Role;
  readonly meta: ModuleMeta;
  /** Pure: identical `params` must produce a deep-equal `Spec`, every call,
   * regardless of call order or how many times it's been called before. */
  buildSpec(params: P): Spec;
  /** Pure in `tSeconds`: never reads or mutates state outside its arguments.
   * A static Module (no moving parts) returns `[]` unconditionally -- see
   * `chute`. This is what keeps a Module identical in the live renderer and
   * the Validator; a stateful `step` would make the two diverge. */
  step(spec: Spec, tSeconds: number): readonly KinematicTransform[];
}
