/** Live mode: /api/live for the visible bbox, points or cells. */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { apiLive } from "../../api";
import type { LiveResponse } from "../../api/types";
import { emergencyText } from "../../domain/risk";
import type { GlobeHandle } from "../globe/GlobeView";
import type maplibregl from "maplibre-gl";

export function LiveControls({ globe, country }: {
  globe: GlobeHandle | null; country: string | null;
}) {
  const { t } = useT();
  const [window_, setWindow_] = useState("24h");
  const [age, setAge] = useState<number | null>(null);
  const [n, setN] = useState(0);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const load = async (w: string) => {
    if (!globe) return;
    const bbox = globe.bounds();
    const res: LiveResponse | null = await apiLive(w, bbox);
    if (!res) { setN(0); return; }
    const cells = new Map<string, number>();
    if (res.mode === "cells" && res.cells) {
      for (const cc of res.cells) cells.set(cc.h3, cc.n);
    } else if (res.points) {
      for (const p of res.points) {
        const { latLngToCell } = await import("h3-js");
        const h = latLngToCell(p.lat, p.lon, 5);
        cells.set(h, (cells.get(h) ?? 0) + 1);
      }
    }
    globe.setCells(cells, [
      "interpolate", ["linear"], ["get", "n"],
      0, "#f6d746", 5, "#e0532a", 20, "#8c1d40",
    ]);
    setN(res.points?.length ?? res.cells?.length ?? 0);
    if (res.generated_at) {
      setAge(Math.max(0, Math.round(
        (Date.now() - Date.parse(res.generated_at)) / 3_600_000)));
    }
    void mapRef;
  };

  useEffect(() => { load(window_); // eslint-disable-next-line
  }, [window_, globe]);

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
        <span className="muted" aria-live="polite">
          {n === 0 ? t("live.noData") : `${n}`}
          {age != null && ` · ${t("live.updated", { h: age })}`}
        </span>
      </div>
      <p className="notice" style={{ margin: 0 }}>
        {t("live.notice")}<br />{emergencyText(country, t)}
      </p>
    </div>
  );
}
