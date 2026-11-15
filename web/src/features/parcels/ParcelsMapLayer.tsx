/** Parcels results on the map: the field's parcels stay filled with
 * their crop color; the API zones are drawn with geometry, never
 * color alone —
 *   hotspot   filled ring band around the detection
 *   fire_risk outlined ring band around the risk cell
 *   dry       an outline band along the dry parcel edge
 *   bare_soil diagonal stripes + faint fill
 * plus an icon badge per parcel (fire % / water %) anchored at its
 * centre, re-projected on every map move. */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { GlobeHandle, Shape } from "../globe/GlobeView";
import {
  cropColor, type ParcelInput, type ParcelsResponse,
} from "../../domain/parcels";
import { mercatorProject, ringCenter } from "../../domain/parcelsGeo";
import { zoneShapes } from "./zoneShapes";
import { Icon } from "./CropIcon";

export function ParcelsMapLayer({ globe, parcels, res }: {
    globe: GlobeHandle;
    parcels: ParcelInput[];
    res: ParcelsResponse }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState(() => globe.center());
  const [size, setSize] = useState<[number, number]>([0, 0]);

  useEffect(() => globe.onMove((lat, lon, zoom) =>
    setCam({ lat, lon, zoom })), [globe]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    setSize([el.clientWidth, el.clientHeight]);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sh: Shape[] = [];
    for (const p of parcels) {
      sh.push({ geom: p.geom, kind: "zone", color: cropColor(p.crop) });
    }
    for (const z of res.zones) sh.push(...zoneShapes(z));
    globe.setShapes(sh);
  }, [globe, parcels, res]);

  const [w, h] = size;
  const proj = w && h ? mercatorProject(cam, w, h) : null;

  return (
    <div ref={ref} className="parcel-map" aria-hidden="true">
      {proj && res.parcels.map((ap) => {
        const inp = parcels.find((p) => p.id === ap.id);
        const ring = inp?.geom[0];
        if (!ring) return null;
        const [x, y] = proj(ringCenter(ring));
        if (x < -40 || y < -40 || x > w + 40 || y > h + 40) return null;
        return (
          <div key={ap.id} className="parcel-badge"
               style={{ left: x, top: y }}>
            <Icon kind="flame" size={13} />
            <span>{ap.indicators.fire.pct ?? "–"}%</span>
            <Icon kind="drop" size={13} />
            <span>{ap.indicators.water.pct ?? "–"}%</span>
          </div>);
      })}
      {proj && res.zones
        .filter((z) => (z.kind === "hotspot" || z.kind === "fire_risk")
                       && z.center)
        .map((z, i) => {
          const [x, y] = proj([z.center![1], z.center![0]]);
          return (
            <div key={`z${i}`} className={`zone-chip ${z.kind}`}
                 style={{ left: x, top: y }}>
              <Icon kind={z.kind === "hotspot" ? "flame" : "alert"}
                    size={12} />
              <span>{z.kind === "hotspot"
                ? t("parcels.zone.hotspot")
                : t("parcels.zone.fire_risk")}</span>
            </div>);
        })}
    </div>);
}
