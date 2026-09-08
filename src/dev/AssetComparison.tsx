import type { AssetLoadState } from "../assets/render/useAuthoredAssets";

export type ComparisonSource = "legacy" | "authored";

export function AssetComparison({
  source,
  onChange,
  state,
  onRetry,
}: {
  readonly source: ComparisonSource | null;
  readonly onChange: (source: ComparisonSource) => void;
  readonly state: AssetLoadState;
  readonly onRetry: () => void;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <fieldset
      style={{ margin: 0, padding: "0.5rem", border: "1px solid #45515b", borderRadius: "0.5rem" }}
    >
      <legend>Captured geometry comparison</legend>
      <button
        type="button"
        style={{
          background: source === "legacy" ? "#d8ff42" : "#2b2f33",
          color: source === "legacy" ? "#12171c" : "#eef3f6",
        }}
        aria-pressed={source === "legacy"}
        onClick={() => onChange("legacy")}
      >
        Original baseline
      </button>{" "}
      <button
        type="button"
        style={{
          background: source === "authored" ? "#d8ff42" : "#2b2f33",
          color: source === "authored" ? "#12171c" : "#eef3f6",
        }}
        aria-pressed={source === "authored"}
        onClick={() => onChange("authored")}
      >
        Blender baseline
      </button>
      {(state.status === "idle" || state.status === "loading") && (
        <p role="status">Loading Blender assets…</p>
      )}
      {state.status === "error" && (
        <div role="alert">
          <p>Could not load Blender assets: {state.message}</p>
          <button type="button" onClick={onRetry}>
            Retry assets
          </button>
        </div>
      )}
    </fieldset>
  );
}
