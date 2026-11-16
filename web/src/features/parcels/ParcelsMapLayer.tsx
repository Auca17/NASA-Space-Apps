/** Parcels results on the map: the field's parcels stay filled with
 * their crop color; the API zones are drawn with geometry, never
 * color alone —
 *   hotspot   filled ring band around the detection
 *   fire_risk outlined ring band around the risk cell
 *   dry       an outline band along the dry parcel edge
 *   bare_soil diagonal stripes + faint fill
 * plus an icon badge per parcel (fire % / water %) anchored at its
 * centre, re-projected on every map move. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { GlobeHandle, Shape } from "../globe/GlobeView";
import {
  cropColor, type ParcelInput, type ParcelsResponse,
} from "../../domain/parcels";
import { mercatorProject, ringCenter } from "../../domain/parcelsGeo";
import type { HazardId } from "../../domain/parcelsProfile";
import { zoneShapes } from "./zoneShapes";
import { Icon } from "./CropIcon";
import { HAZARD_ICON, hazardText } from "./HazardInd";

export function ParcelsMapLayer({ globe, parcels, res, base = [] }: {
    globe: GlobeHandle;
    parcels: ParcelInput[];
    res: ParcelsResponse;
    /** the analysis shapes (outline, selected zone in yellow, moisture
     * zones) that must stay visible under the results */
    base?: Shape[] }) {
  const { t, lang } = useT();
  const badgeFmt = useMemo(
    () => new Intl.NumberFormat(lang === "en" ? "en" : "es",
      { maximumFractionDigits: 1 }), [lang]);
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
      // a zone of the automatic division keeps its outline and name;
      // a drawn parcel is filled with its crop colour
      sh.push(p.zone
        ? { geom: p.geom, kind: "parcel", label: p.name }
        : { geom: p.geom, kind: "zone", color: cropColor(p.crop) });
    }
    sh.push(...base);
    for (const z of res.zones) sh.push(...zoneShapes(z));
    globe.setShapes(sh);
  }, [globe, parcels, res, base]);


  const [w, h] = size;
  // the map's own projection (exact); the mercator helper is only a
  // fallback for handles without it (tests)
  const proj = !w || !h ? null
    : globe.project ? ([la, lo]: [number, number]) => globe.project!(la, lo)
    : mercatorProject(cam, w, h);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= w && y <= h;

  return (
    <div ref={ref} className="parcel-map" aria-hidden="true">
      {proj && res.parcels.map((ap) => {
        const inp = parcels.find((p) => p.id === ap.id);
        const ring = inp?.geom[0];
        if (!ring) return null;
        const [x, y] = proj(ringCenter(ring));
        if (!inside(x, y)) return null;
        // always the same two numbers, so the legend can explain them
        const shown: HazardId[] = ["fire", "drought"];
        return (
          <div key={ap.id} className={`parcel-badge${inp?.zone ? " under-label" : ""}`}
               data-tour="badges" style={{ left: x, top: y }}
               title={`${inp?.name ?? ""}: ${t("parcels.legend.fire")} · ${t("parcels.legend.water")}`}>
            {shown.map((h) => (
              <span key={h} className="badge-hz">
                <Icon kind={HAZARD_ICON[h]} size={13} />
                <span>{hazardText(ap, h, t, badgeFmt)}</span>
              </span>))}
          </div>);
      })}
      {proj && res.zones
        .filter((z) => (z.kind === "hotspot" || z.kind === "fire_risk")
                       && z.center)
        .map((z, i) => {
          const [x, y] = proj([z.center![1], z.center![0]]);
          if (!inside(x, y)) return null;   // far detections stay off-map
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
      {res.parcels.length > 0 && (
        <div className="parcel-legend">
          <strong>{t(parcels.some((p) => p.zone)
            ? "parcels.legend.titleZones" : "parcels.legend.title")}</strong>
          <span><Icon kind={HAZARD_ICON.fire} size={12} /> {t("parcels.legend.fire")}</span>
          <span><Icon kind={HAZARD_ICON.drought} size={12} /> {t("parcels.legend.water")}</span>
        </div>)}
    </div>);
}
