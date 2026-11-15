/** Historic playback: month slider + play over globe/{YYYY-MM}.json,
 * plus Argentina field layers from field/grid shards (task 18.4). */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { globeMonth, gridShard } from "../../api";
import { viridis, css } from "../../domain/colors";
import { Legend } from "../../components/ui";
import { polygonToCells, latLngToCell } from "h3-js";
import type { GlobeHandle } from "../globe/GlobeView";

const START = "2000-11";
const AR = { w: -74, s: -56.5, e: -52.5, n: -21 };

type FieldLayer = "fire" | "rain" | "heat" | "bare" | "sm" | "wt";
interface View { lat: number; lon: number; zoom: number;
                 bbox: [number, number, number, number] }

const FIELD_METRIC: Record<Exclude<FieldLayer, "fire">, {
    key: string; unitKey: string; diverging?: boolean }> = {
  rain: { key: "rain_mm_yr", unitKey: "units.mmYr" },
  heat: { key: "hot_days_gt35", unitKey: "units.daysYr" },
  bare: { key: "bare_soil_days_yr", unitKey: "units.daysYr" },
  sm: { key: "sm_anom_pct", unitKey: "units.pct", diverging: true },
  wt: { key: "grace_trend", unitKey: "", diverging: true },
};

const WT_MAP: Record<string, number> = { down: -1, flat: 0, up: 1 };

function monthSeq(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function HistoricControls({ globe, onMonth, view }: {
  globe: GlobeHandle | null;
  onMonth?: (month: string) => void;
  view?: View | null;
}) {
  const { t, lang } = useT();
  const now = new Date().toISOString().slice(0, 7);
  const monthFmt = new Intl.DateTimeFormat(lang, { month: "short",
    year: "numeric", timeZone: "UTC" });
  const monthLabel = (m: string) =>
    monthFmt.format(new Date(`${m}-01T00:00:00Z`));
  const months = useRef(monthSeq(START, now));
  const [idx, setIdx] = useState(months.current.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [maxN, setMaxN] = useState(0);
  const cache = useRef(new Map<string, Map<string, number> | null>());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // field layers state
  const [layer, setLayer] = useState<FieldLayer>("fire");
  const [fvals, setFvals] = useState<Map<string, number> | null>(null);
  const [fmax, setFmax] = useState(0);
  const [fmsg, setFmsg] = useState<string | null>(null);
  const [hasSm, setHasSm] = useState(false);

  const show = async (i: number) => {
    if (!globe) return;
    const mo = months.current[i];
    onMonth?.(mo);
    let cells = cache.current.get(mo);
    if (cells === undefined) {
      const sh = await globeMonth(mo);
      cells = sh ? new Map(sh.cells.map(([h, n]) => [h, n])) : null;
      cache.current.set(mo, cells);
    }
    if (!cells) { globe.setCells(new Map(), null); setMaxN(0); return; }
    const max = Math.max(1, ...cells.values());
    setMaxN(max);
    globe.setCells(cells, [
      "interpolate", ["linear"],
      ["sqrt", ["/", ["get", "n"], max]],
      0, css(viridis(0.1)), 0.5, css(viridis(0.6)), 1, css(viridis(1)),
    ]);
  };

  useEffect(() => {
    if (layer !== "fire") return;
    show(idx); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, globe, layer]);

  // ---- field layers: load res-5 cells for the view bbox (zoom >= 5) --
  useEffect(() => {
    if (!globe || layer === "fire") return;
    let cancelled = false;
    const run = async () => {
      if (!view || view.zoom < 5) {
        setFmsg(t("layers.zoomHint")); setFvals(null);
        globe.setCells(new Map(), null); return;
      }
      const [w, s, e, n] = view.bbox;
      if (e < AR.w || w > AR.e || n < AR.s || s > AR.n) {
        setFmsg(t("layers.onlyAR")); setFvals(null);
        globe.setCells(new Map(), null); return;
      }
      const ring: [number, number][] = [[s, w], [s, e], [n, e], [n, w]];
      let r2s: string[];
      try { r2s = polygonToCells(ring, 2); }
      catch { setFmsg(t("layers.onlyAR")); return; }
      if (r2s.length > 20) {
        setFmsg(t("layers.zoomHint")); setFvals(null);
        globe.setCells(new Map(), null); return;
      }
      const metric = FIELD_METRIC[layer];
      const vals = new Map<string, number>();
      const shards = await Promise.all(r2s.map((r) => gridShard(r)));
      if (cancelled) return;
      let smSeen = false;
      for (const sh of shards) {
        if (!sh) continue;
        for (const [cid, c] of Object.entries(sh.cells)) {
          const cv = c as Record<string, unknown>;
          if (cv.sm_anom_pct != null) smSeen = true;
          const raw = cv[metric.key];
          let v: number | null = null;
          if (typeof raw === "number") v = raw;
          else if (typeof raw === "string" && metric.key === "grace_trend")
            v = WT_MAP[raw] ?? 0;
          if (v != null) vals.set(cid, v);
        }
      }
      if (smSeen) setHasSm(true);
      if (vals.size === 0) {
        setFmsg(t("layers.noData")); setFvals(null);
        globe.setCells(new Map(), null); return;
      }
      setFmsg(null); setFvals(vals);
      const mx = Math.max(1e-9, ...[...vals.values()].map(Math.abs));
      const dom = metric.diverging ? Math.max(mx, 1) : Math.max(...vals.values());
      setFmax(dom);
      const expr = metric.diverging
        ? ["interpolate", ["linear"], ["get", "n"],
           -dom, "#2166ac", 0, "#f7f7f7", dom, "#b2182b"]
        : ["interpolate", ["linear"], ["/", ["get", "n"], dom],
           0, css(viridis(0.1)), 0.5, css(viridis(0.6)),
           1, css(viridis(1))];
      globe.setCells(vals, expr);
    };
    run().catch(() => setFmsg(t("layers.noData")));
    return () => { cancelled = true; };
  }, [globe, layer, view, t]);

  // value under the reticle for the summary line
  const centerVal = (() => {
    if (!view || !fvals) return null;
    try {
      const c = latLngToCell(view.lat, view.lon, 5);
      return fvals.has(c) ? fvals.get(c)! : null;
    } catch { return null; }
  })();

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setIdx((i) => {
        if (i >= months.current.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(iv);
  }, [playing, speed]);

  // space toggles play (keyboard, PRD 12.3)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="controls">
      <div className="row">
        <button onClick={() => setPlaying(!playing)}
                aria-label={playing ? t("historic.pause") : t("historic.play")}
                aria-pressed={playing}>
          {playing ? "⏸" : "▶"}
        </button>
        <span aria-live="polite" role="status">
          {monthLabel(months.current[idx])}
        </span>
        {!reduce && (
          <label>{t("historic.speed")}
            <select value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}>
              {[2, 4, 8].map((s) =>
                <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>)}
      </div>
      <input type="range" min={0} max={months.current.length - 1}
             value={idx} aria-label={t("historic.month")}
             onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }}
             style={{ width: "100%" }} />
      {layer === "fire" && maxN > 0 && (
        <>
          <Legend from="0" to={String(maxN)}
            colors={[css(viridis(0.1)), css(viridis(0.55)),
                     css(viridis(1))]} />
          <p className="muted" style={{ margin: 0, fontSize: "0.72rem" }}>
            {t("legend.unit")} · {t("legend.maxMonth",
              { max: maxN, month: monthLabel(months.current[idx]) })}
          </p>
        </>)}

      <label className="layer-sel">{t("layers.title")}
        <select value={layer}
                aria-label={t("layers.title")}
                onChange={(e) => {
                  setLayer(e.target.value as FieldLayer);
                  setPlaying(false);
                }}>
          <option value="fire">{t("layers.fire")}</option>
          <optgroup label={t("layers.groupField")}>
            <option value="rain">{t("layers.rain")}</option>
            <option value="heat">{t("layers.heat")}</option>
            <option value="bare">{t("layers.bare")}</option>
            {hasSm && <option value="sm">{t("layers.sm")}</option>}
            <option value="wt">{t("layers.wt")}</option>
          </optgroup>
        </select>
      </label>

      {layer !== "fire" && (
        <div className="field-layer">
          {fmsg && <p className="muted" role="status">{fmsg}</p>}
          {fvals && (
            <>
              <Legend
                from={FIELD_METRIC[layer].diverging ? `−${fmax}` : "0"}
                to={`${fmax}`} mid={FIELD_METRIC[layer].diverging ? "0"
                  : undefined}
                colors={FIELD_METRIC[layer].diverging
                  ? ["#2166ac", "#f7f7f7", "#b2182b"]
                  : [css(viridis(0.1)), css(viridis(0.55)),
                     css(viridis(1))]} />
              <p className="muted" style={{ margin: 0,
                fontSize: "0.72rem" }}>
                {FIELD_METRIC[layer].unitKey &&
                  t(FIELD_METRIC[layer].unitKey)}
                {centerVal != null &&
                  ` · ${t("field.center")}: ${centerVal}`}
              </p>
            </>)}
        </div>)}
    </div>
  );
}
