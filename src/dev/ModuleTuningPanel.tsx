import "./moduleTuning.css";
import { startTransition, useActionState, useEffect, useState } from "react";
import { ALL_MODULES } from "../modules/registry";
import {
  MODULE_IDS,
  loadSavedModuleSettings,
  moduleSettingsSchema,
  parseModuleSettings,
} from "../assets/settings";
import { validateCourseSettings } from "../assets/validateCourseSettings";
import { useAuthoredAssets } from "../assets/render/useAuthoredAssets";
import type { ModuleId, ModuleSettings, SettingsSnapshot } from "../assets/types";
import { ParamPanel } from "../showcase/ParamPanel";
import {
  readModuleSettings,
  saveModuleSettings,
  SettingsRequestError,
} from "./moduleSettingsClient";

interface OperationState {
  readonly snapshot: SettingsSnapshot | null;
  readonly error: string | null;
  readonly conflict: boolean;
}
const INITIAL: OperationState = { snapshot: null, error: null, conflict: false };
type Action =
  | { readonly kind: "load" }
  | { readonly kind: "save"; readonly settings: ModuleSettings };
export interface ModuleTuningPanelProps {
  readonly applied: ModuleSettings | null;
  readonly onApply: (settings: ModuleSettings) => void;
  readonly moduleIds?: readonly ModuleId[];
  readonly selectedId?: ModuleId;
  readonly onSelect?: (id: ModuleId) => void;
}
export function ModuleTuningPanel({
  applied,
  onApply,
  moduleIds = MODULE_IDS,
  selectedId,
  onSelect,
}: ModuleTuningPanelProps) {
  const [localId, setLocalId] = useState<ModuleId>(moduleIds[0]);
  const id = selectedId ?? localId;
  const [draft, setDraft] = useState(loadSavedModuleSettings);
  const [applyError, setApplyError] = useState<string | null>(null);
  const assets = useAuthoredAssets(true);
  const [operation, dispatch, pending] = useActionState(
    async (previous: OperationState, action: Action): Promise<OperationState> => {
      try {
        if (action.kind === "load") {
          const snapshot = await readModuleSettings();
          if (!previous.snapshot) setDraft(snapshot.settings);
          return { snapshot, error: null, conflict: false };
        }
        if (!previous.snapshot || previous.conflict)
          throw new Error("Reload the saved revision before saving");
        const snapshot = await saveModuleSettings({
          expectedRevision: previous.snapshot.revision,
          settings: action.settings,
        });
        return { snapshot, error: null, conflict: false };
      } catch (error) {
        return {
          ...previous,
          error: error instanceof Error ? error.message : String(error),
          conflict:
            previous.conflict || (error instanceof SettingsRequestError && error.status === 409),
        };
      }
    },
    INITIAL,
  );
  useEffect(() => {
    startTransition(() => dispatch({ kind: "load" }));
  }, [dispatch]);
  const equal = (a: ModuleSettings | null, b: ModuleSettings | null) =>
    a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
  const savedStatus = operation.conflict
    ? "Saved revision changed"
    : equal(draft, operation.snapshot?.settings ?? null)
      ? "Draft saved"
      : "Unsaved draft";
  function apply() {
    try {
      const settings = parseModuleSettings(draft);
      validateCourseSettings(settings);
      onApply(settings);
      setApplyError(null);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section className="module-tuning" aria-label="Shared Module tuning">
      <h2>Shared Module tuning</h2>
      <p>
        Sliders edit the draft. Restart applies it to every matching Module. Save updates the
        repository without restarting.
      </p>
      <label>
        Module
        <select
          value={id}
          onChange={(event) => {
            const next = event.target.value as ModuleId;
            setLocalId(next);
            onSelect?.(next);
          }}
        >
          {moduleIds.map((moduleId) => (
            <option key={moduleId} value={moduleId}>
              {ALL_MODULES.find((module) => module.id === moduleId)!.meta.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={pending || !operation.snapshot}>
        <legend>Draft controls</legend>
        <ParamPanel
          schema={moduleSettingsSchema(id)}
          values={{ ...draft[id] }}
          onChange={(key, value) => {
            setDraft((previous) => ({ ...previous, [id]: { ...previous[id], [key]: value } }));
            setApplyError(null);
          }}
        />
      </fieldset>
      <p role="status">
        {pending
          ? "Accessing saved settings…"
          : `${equal(draft, applied) ? "Draft applied" : "Draft not applied"} · ${savedStatus}`}
      </p>
      {(operation.error || applyError) && <p role="alert">{applyError ?? operation.error}</p>}
      {operation.conflict && (
        <p>
          Your draft is preserved. Reload the saved revision, review your draft, then explicitly
          Save again.
        </p>
      )}
      {assets.state.status !== "ready" && (
        <p role="status">
          {assets.state.status === "error" ? assets.state.message : "Loading Blender assets…"}
        </p>
      )}
      {assets.state.status === "error" && (
        <button
          type="button"
          onClick={() => {
            void assets.retry();
          }}
        >
          Retry assets
        </button>
      )}
      <div className="module-tuning__actions">
        <button
          type="button"
          disabled={pending || !operation.snapshot || assets.state.status !== "ready"}
          onClick={apply}
        >
          Restart with draft
        </button>
        <button
          type="button"
          disabled={pending || !operation.snapshot || operation.conflict}
          onClick={() => startTransition(() => dispatch({ kind: "save", settings: draft }))}
        >
          Save settings
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => dispatch({ kind: "load" }))}
        >
          Reload saved revision
        </button>
        <button
          type="button"
          disabled={pending || !operation.snapshot}
          onClick={() => {
            if (operation.snapshot) setDraft(operation.snapshot.settings);
            setApplyError(null);
          }}
        >
          Reset draft to saved
        </button>
      </div>
      <p>
        Reload refreshes the saved revision and keeps an existing draft. Reset replaces the draft
        with saved values.
      </p>
    </section>
  );
}
