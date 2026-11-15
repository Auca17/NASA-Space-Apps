/** Live mode: one world-wide /api/live fetch per time window so the
 * detection cells cover the whole map — panning or zooming never
 * leaves an empty band. Zoomed in, a viewport query refines the cells
 * and feeds the "fire near you" check. A late answer to an older
 * query is ignored. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { apiLiveResult } from "../../api";
import {
  liveViewBoxes, mergeLiveCells, summarizeLive,
  POINTS_MIN_ZOOM, WORLD_BBOX,
  type LiveBody, type LiveSummary,
} from "../../domain/live";
import { emergencyText } from "../../domain/risk";
import {
  DIRECTION_KEYS, livePoints, nearestDetection,
  type NearbyDetection,
} from "../../domain/emergency";
import { EmergencyBlock } from "../emergency/EmergencyBlock";
import type { GlobeHandle } from "../globe/GlobeView";

const COLORS = ["interpolate", ["linear"], ["get", "n"],
  0, "#f6d746", 5, "#e0532a", 20, "#8c1d40"];

/** Distance under which a point detection counts as "near" (task 26). */
const NEAR_KM = 10;

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "done"; sum: LiveSummary; at: Date; body: LiveBody;
      /** the viewport body when zoomed in: feeds the near check */
      viewBody: LiveBody | null };

export function LiveControls({ globe, country }: {
  globe: GlobeHandle | null; country: string | null;
}) {
  const { t, lang } = useT();
  const [window_, setWindow_] = useState("24h");
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);
  const viewSeq = useRef(0);
  const windowRef = useRef(window_);
  windowRef.current = window_;
  const worldRef = useRef<{ body: LiveBody; sum: LiveSummary } | null>(null);

  /** Repaint from the cached world body (+ a viewport fetch when
   * zoomed in): runs on every move without re-querying the world. */
  const repaint = useCallback(async () => {
    const w = worldRef.current;
    if (!globe || !w) return;
    const id = ++viewSeq.current;
    const view = globe.bounds();
    let viewBody: LiveBody | null = null;
    if (globe.center().zoom >= POINTS_MIN_ZOOM) {
      const parts = await Promise.all(liveViewBoxes(view)
        .map((box) => apiLiveResult(windowRef.current, box)));
      if (id !== viewSeq.current) return;
      const okParts = parts.flatMap((p) => p.ok ? [p.data] : []);
      if (okParts.length) {
        viewBody = {
          mode: okParts.some((p) => p.mode === "points")
            ? "points" : "cells",
          points: okParts.flatMap((p) => p.points ?? []),
          cells: okParts.flatMap((p) => p.cells ?? []),
          sources_failed: okParts.flatMap((p) => p.sources_failed ?? []),
          country: okParts[0].country ?? w.body.country,
        };
      }
    }
    const viewSum = viewBody ? summarizeLive(viewBody) : null;
    // world cells paint everywhere; in view the finer local cells win
    const cells = viewSum
      ? mergeLiveCells(w.sum, viewSum, view)
      : w.sum.cells;
    globe.setCells(cells, COLORS);
    const sum = viewSum ?? summarizeLive(w.body, view);
    const failed = [...w.sum.failed,
                    ...(viewBody?.sources_failed ?? [])];
    setState({ kind: "done", sum: { ...sum, failed }, at: new Date(),
               body: w.body, viewBody });
  }, [globe]);

  const load = useCallback(async () => {
    if (!globe) return;
    const id = ++seq.current;
    setState({ kind: "loading" });
    worldRef.current = null;
    // never leave the previous view's hotspots on screen while waiting
    globe.setCells(new Map(), COLORS);
    const res = await apiLiveResult(windowRef.current, WORLD_BBOX);
    if (id !== seq.current) return; // a newer query is under way
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    let sum: LiveSummary;
    try { sum = summarizeLive(res.data); }
    catch { setState({ kind: "error" }); return; }
    worldRef.current = { body: res.data, sum };
    await repaint();
  }, [globe, repaint]);

  useEffect(() => { load(); }, [load, window_]);
  useEffect(() => globe?.onMove(() => { void repaint(); }),
            [globe, repaint]);
  // leaving the mode: a pending answer must not paint the map
  useEffect(() => () => { seq.current++; viewSeq.current++; }, []);

  const time = (d: Date) => d.toLocaleTimeString(lang === "en" ? "en" : "es",
    { hour: "2-digit", minute: "2-digit" });

  // Task 26: a point detection within NEAR_KM of the reference (map
  // centre / reticle) opens the emergency block with distance, compass
  // direction and how long ago the satellite saw it.
  const done = state.kind === "done" ? state : null;
  const ref: [number, number] | null = globe?.center
    ? [globe.center().lat, globe.center().lon] : null;
  const near: NearbyDetection | null = done && ref
    ? (() => {
        const n = nearestDetection(
          livePoints(done.viewBody ?? done.body), ref);
        return n && n.km <= NEAR_KM ? n : null;
      })()
    : null;
  const respCountry = done?.viewBody?.country ?? done?.body.country ?? null;

  let msg: React.ReactNode;
  if (state.kind === "loading") msg = t("live.loading");
  else if (state.kind === "error") msg = t("live.error");
  else {
    const s = state.sum;
    msg = <>
      {s.count === 0 ? t("live.noData")
        : s.unit === "cells"
          ? t("live.cells", { n: s.count, d: s.detections })
          : t("live.detections", { n: s.count })}
      {" · "}{t("live.queriedAt", { t: time(state.at) })}
    </>;
  }

  return (
    <div className="controls">
      <div className="row">
        <strong>{t("nav.live")}</strong>
        <span className="seg" role="group" aria-label={t("live.window")}>
          {["24h", "48h", "7d"].map((w) => (
            <button key={w} aria-pressed={window_ === w}
                    onClick={() => setWindow_(w)}>{w}</button>
          ))}
        </span>
      </div>
      <p className={`live-status${state.kind === "error" ? " err" : ""}`}
         role="status" aria-live="polite">{msg}</p>
      {state.kind === "error" && (
        <button onClick={() => load()}>{t("live.retry")}</button>)}
      {state.kind === "done" && state.sum.failed.length > 0 && (
        <p className="notice" role="alert">
          {t("live.partial", { s: state.sum.failed.join(", ") })}</p>)}
      {near && (
        <div className="emerg-near">
          <p><strong>{t("emerg.nearby")}</strong>{" — "}
            {t("emerg.nearby.detail", {
              km: new Intl.NumberFormat(lang === "en" ? "en" : "es",
                { maximumFractionDigits: 1 }).format(near.km),
              dir: t(DIRECTION_KEYS[near.dir]) })}
            {near.hoursAgo != null && (
              <span className="muted"> — {t("emerg.nearby.ago",
                { h: Math.round(near.hoursAgo) })}</span>)}
          </p>
          <EmergencyBlock
            country={respCountry ?? country}
            mapCenter={globe ? { lat: globe.center().lat,
                                 lon: globe.center().lon } : null}
            detection={near} />
        </div>)}
      <p className="notice" style={{ margin: 0 }}>
        {t("live.notice")}<br />{emergencyText(respCountry ?? country, t)}
      </p>
    </div>
  );
}
