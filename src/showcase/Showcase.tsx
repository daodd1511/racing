import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useMemo, useRef, useState } from "react";

import { ModuleColliders } from "../modules/render/ModuleColliders";
import { SCALE } from "../race/scale";
import { percentile, shuffleCoefficient } from "../validator/metrics";
import { CameraFraming } from "./CameraFraming";
import { Feeder, type FeedMode } from "./Feeder";
import { EMPTY_LIVE_METRICS, MetricsReadout, type LiveMetricsState } from "./MetricsReadout";
import { defaultParamValues, ParamPanel, type ParamValues } from "./ParamPanel";
import { MODULES, type ShowcaseEntry } from "./registry";

const FEED_MODES: readonly FeedMode[] = ["continuous", "burst15", "single"];

function findEntry(id: string): ShowcaseEntry {
  return MODULES.find((entry) => entry.id === id) ?? MODULES[0];
}

/** The Module tuning lab: pick a Module, adjust its params live, feed
 * marbles in, and watch Dwell/exit speed/Shuffle/stalls update -- per
 * PLAN.md -> "Showcase". This is also this spec's feel lab: the smallest
 * surface that can answer "do 32mm marbles look fast?" without waiting for
 * a whole Course to exist. */
export function Showcase() {
  const [selectedId, setSelectedId] = useState(MODULES[0].id);
  const selected = findEntry(selectedId);
  const [params, setParams] = useState<ParamValues>(() => defaultParamValues(selected.meta.params));
  const [feedMode, setFeedMode] = useState<FeedMode>("continuous");
  const [triggerNonce, setTriggerNonce] = useState(0);
  const [metrics, setMetrics] = useState<LiveMetricsState>(EMPTY_LIVE_METRICS);

  // Raw accumulation lives in refs, not state: an exit/stall event is
  // infrequent enough (once per marble, not once per frame) that recomputing
  // and pushing a fresh `LiveMetricsState` on each one is cheap, but the
  // running totals themselves don't need to be React state.
  const dwellSecondsByIdRef = useRef(new Map<number, number | null>());
  const exitSpeedsRef = useRef<number[]>([]);

  const spec = useMemo(() => selected.buildSpec(params), [selected, params]);

  // Deliberately built from the Module's *default* params, not the live
  // `params` state: this decides how the camera frames a Module, and
  // recomputing it on every param edit -- `spec.footprint.bounds` does
  // change with params, e.g. the chute's `length` -- would yank the camera
  // back to a fresh fit on every slider drag, fighting any zoom the user
  // just set by hand. It only needs to change identity when the Module
  // itself does, which `[selected]` alone guarantees.
  const framingBounds = useMemo(
    () => selected.buildSpec(defaultParamValues(selected.meta.params)).footprint.bounds,
    [selected],
  );

  const resetMetrics = useCallback(() => {
    dwellSecondsByIdRef.current = new Map();
    exitSpeedsRef.current = [];
    setMetrics(EMPTY_LIVE_METRICS);
  }, []);

  const recomputeMetrics = useCallback(() => {
    const byId = dwellSecondsByIdRef.current;
    const allDwellSeconds = Array.from(byId.values());
    const exitedDwellSeconds = allDwellSeconds
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const stalled = allDwellSeconds.filter((value) => value === null).length;
    const maxId = byId.size === 0 ? -1 : Math.max(...byId.keys());
    const orderedById = Array.from({ length: maxId + 1 }, (_, id) => byId.get(id) ?? null);
    const exitSpeeds = exitSpeedsRef.current;

    setMetrics({
      resolved: byId.size,
      exited: exitedDwellSeconds.length,
      stalled,
      dwellSecondsP50: percentile(exitedDwellSeconds, 0.5),
      dwellSecondsP99: percentile(exitedDwellSeconds, 0.99),
      meanExitSpeed:
        exitSpeeds.length > 0 ? exitSpeeds.reduce((sum, speed) => sum + speed, 0) / exitSpeeds.length : null,
      shuffleCoefficient: shuffleCoefficient(orderedById),
    });
  }, []);

  const handleExit = useCallback(
    (id: number, dwellSeconds: number, exitSpeed: number) => {
      dwellSecondsByIdRef.current.set(id, dwellSeconds);
      exitSpeedsRef.current.push(exitSpeed);
      recomputeMetrics();
    },
    [recomputeMetrics],
  );

  const handleStall = useCallback(
    (id: number) => {
      dwellSecondsByIdRef.current.set(id, null);
      recomputeMetrics();
    },
    [recomputeMetrics],
  );

  const selectModule = useCallback(
    (id: string) => {
      const entry = findEntry(id);
      setSelectedId(entry.id);
      setParams(defaultParamValues(entry.meta.params));
      resetMetrics();
    },
    [resetMetrics],
  );

  const updateParam = useCallback(
    (key: string, value: number | boolean) => {
      setParams((previous) => ({ ...previous, [key]: value }));
      resetMetrics();
    },
    [resetMetrics],
  );

  const changeFeedMode = useCallback((mode: FeedMode) => {
    setFeedMode(mode);
  }, []);

  const triggerFeed = useCallback(() => {
    setTriggerNonce((nonce) => nonce + 1);
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "12rem 1fr 16rem", height: "100%", color: "#eef3f6" }}>
      <aside style={{ background: "#1a1d1f", padding: "0.75rem", overflowY: "auto" }}>
        <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Modules</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {MODULES.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => selectModule(entry.id)}
                aria-pressed={entry.id === selectedId}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.5rem",
                  background: entry.id === selectedId ? "#2b2f33" : "transparent",
                  color: "inherit",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {entry.meta.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div style={{ position: "relative", background: "#0b0c0d" }}>
        {/* `position` here is only a fallback for the first frame, before
         * `<CameraFraming>`'s effect runs and overwrites it -- keeps that
         * frame from flashing R3F's own generic default camera position. */}
        <Canvas camera={{ position: [0, 0.3, 0.6], fov: 50 }} shadows>
          {/* Dark charcoal per PLAN.md -> "Art direction" -- set on the
           * scene itself, not left to the page's CSS behind a possibly-
           * transparent canvas. */}
          <color attach="background" args={["#0b0c0d"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[0.6, 1, 0.4]} intensity={1.4} castShadow />
          {/* Fits the camera to the selected Module and then lets the user
           * zoom/pan/orbit freely -- see CameraFraming.tsx. The old fixed
           * position only ever suited the chute; the vortex bowl's bounds
           * run more than twice as wide. */}
          <CameraFraming bounds={framingBounds} />
          <Physics gravity={[SCALE.gravity[0], SCALE.gravity[1], SCALE.gravity[2]]}>
            <ModuleColliders spec={spec} />
            <Feeder
              entry={spec.footprint.entry}
              exit={spec.footprint.exit}
              mode={feedMode}
              triggerNonce={triggerNonce}
              onExit={handleExit}
              onStall={handleStall}
            />
          </Physics>
          <EffectComposer>
            <Bloom intensity={0.6} luminanceThreshold={0.4} luminanceSmoothing={0.2} mipmapBlur />
          </EffectComposer>
        </Canvas>
        <div style={{ position: "absolute", bottom: "0.75rem", left: "0.75rem", display: "flex", gap: "0.5rem" }}>
          {FEED_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => changeFeedMode(mode)}
              aria-pressed={mode === feedMode}
              style={{
                padding: "0.3rem 0.6rem",
                background: mode === feedMode ? "#d8ff42" : "#2b2f33",
                color: mode === feedMode ? "#0b0c0d" : "#eef3f6",
                border: "none",
                cursor: "pointer",
              }}
            >
              {mode}
            </button>
          ))}
          {feedMode !== "continuous" && (
            <button
              type="button"
              onClick={triggerFeed}
              style={{ padding: "0.3rem 0.6rem", background: "#2b2f33", color: "#eef3f6", border: "none", cursor: "pointer" }}
            >
              Feed
            </button>
          )}
        </div>
      </div>

      <aside style={{ background: "#1a1d1f", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <section>
          <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Params</h2>
          <ParamPanel schema={selected.meta.params} values={params} onChange={updateParam} />
        </section>
        <section>
          <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Metrics</h2>
          <MetricsReadout metrics={metrics} />
        </section>
      </aside>
    </div>
  );
}
