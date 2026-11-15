/** Live mode: /api/live for the visible bbox, as detections (points) or
 * cells for large views. Queries again when the map stops moving or the
 * time window changes; a late answer to an older query is ignored. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { apiLiveResult } from "../../api";
import { summarizeLive, type LiveBody, type LiveSummary } from "../../domain/live";
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
  | { kind: "done"; sum: LiveSummary; at: Date; body: LiveBody };

export function LiveControls({ globe, country }: {
  globe: GlobeHandle | null; country: string | null;
}) {
  const { t, lang } = useT();
  const [window_, setWindow_] = useState("24h");
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);
  const windowRef = useRef(window_);
  windowRef.current = window_;

  const load = useCallback(async () => {
    if (!globe) return;
    const id = ++seq.current;
    setState({ kind: "loading" });
    // never leave the previous view's hotspots on screen while waiting
    globe.setCells(new Map(), COLORS);
    const view = globe.bounds();
    const res = await apiLiveResult(windowRef.current, view);
    if (id !== seq.current) return; // a newer query is under way
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    let sum: LiveSummary;
    try { sum = summarizeLive(res.data, view); }
    catch { setState({ kind: "error" }); return; }
    globe.setCells(sum.cells, COLORS);
    setState({ kind: "done", sum, at: new Date(), body: res.data });
  }, [globe]);

  useEffect(() => { load(); }, [load, window_]);
  useEffect(() => globe?.onMove(() => { load(); }), [globe, load]);
  // leaving the mode: a pending answer must not paint the map
  useEffect(() => () => { seq.current++; }, []);

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
        const n = nearestDetection(livePoints(done.body), ref);
        return n && n.km <= NEAR_KM ? n : null;
      })()
    : null;
  const respCountry = done?.body.country ?? null;

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
