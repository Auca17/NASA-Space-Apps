"""MODIS 250 m NDVI versus Sentinel-2 L2A over the real Orin vineyard
(task 24.1). Satellite-versus-finer-satellite comparison, not field truth.

MODIS comes from the ORNL fixed-subset REST API (MOD13Q1 + MYD13Q1,
16-day composites, bands 250m_16_days_NDVI and 250m_16_days_pixel_
reliability). Pixel footprints (equal-area sinusoidal squares) are
intersected exactly with the vineyard polygon via shapely; the MODIS
value is the area-weighted mean over intersecting pixels that pass the
quality filter (pixel_reliability <= 1). Each composite is paired with
the Sentinel-2 observation nearest within 3 days of its mid-date.
"""
import json
import math
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
from shapely.geometry import Polygon, box

ROOT = Path(__file__).resolve().parents[2]
ORNL = "https://modis.ornl.gov/rst/api/v1/{product}/subset"
S2 = ROOT / "data/orin_private/vineyard_sentinel2.json"
LOTS = ROOT / "docs/validation/orin/lots.geojson"
OUT = ROOT / "data/processed/orin/ndvi_modis_vs_s2.json"
R_EARTH = 6371007.181           # MODIS sinusoidal sphere radius (m)
PAIR_MAX_DAYS = 3
FILL = -3000


def vineyard_polygon():
    fc = json.loads(LOTS.read_text(encoding="utf-8"))
    for f in fc["features"]:
        if f["properties"].get("crop_label") == "Viña":
            return Polygon(f["geometry"]["coordinates"][0])
    raise SystemExit("vineyard polygon not found in lots.geojson")


def to_latlon(x_m, y_m):
    """Sinusoidal meters -> (lat, lon) degrees."""
    lat = y_m / R_EARTH
    lon = x_m / (R_EARTH * math.cos(lat))
    return math.degrees(lat), math.degrees(lon)


def pixel_boxes(meta):
    """Pixel center lat/lon + footprint polygon for an ORNL grid."""
    cell, nr, nc = (float(meta["cellsize"]), meta["nrows"], meta["ncols"])
    x0, y0 = float(meta["xllcorner"]), float(meta["yllcorner"])
    boxes = []
    for row in range(nr):
        for col in range(nc):
            xm = x0 + (col + 0.5) * cell
            ym = y0 + (nr - row - 0.5) * cell
            lat, lon = to_latlon(xm, ym)
            dlat = (cell / 2) / 110574.0
            dlon = (cell / 2) / (111320.0 * math.cos(math.radians(lat)))
            boxes.append(box(lon - dlon, lat - dlat,
                             lon + dlon, lat + dlat))
    return boxes


def fetch(product, band, lat, lon, start, end, km=2):
    for att in range(3):
        try:
            r = httpx.get(ORNL.format(product=product), params={
                "latitude": lat, "longitude": lon,
                "startDate": f"A{start.year}{start.timetuple().tm_yday:03d}",
                "endDate": f"A{end.year}{end.timetuple().tm_yday:03d}",
                "kmAboveBelow": km, "kmLeftRight": km, "band": band},
                timeout=120)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            print(f"  {product} {band} retry {att}: {type(exc).__name__}")
            time.sleep(3 + att * 3)
    return None


def composites(poly):
    """{(product, calendar_date): {'ndvi': float, 'px_used': int}}."""
    lat0, lon0 = poly.centroid.y, poly.centroid.x
    start, end = date(2026, 9, 1), date(2026, 11, 30)
    out = {}
    for product in ("MOD13Q1", "MYD13Q1"):
        nd = fetch(product, "250m_16_days_NDVI", lat0, lon0, start, end)
        qa = fetch(product, "250m_16_days_pixel_reliability",
                   lat0, lon0, start, end)
        if not nd or not qa:
            print(f"  {product}: fetch failed, skipped")
            continue
        boxes = pixel_boxes(nd)
        weights = []
        for b in boxes:
            i = poly.intersection(b)
            weights.append(i.area / b.area if not i.is_empty else 0.0)
        px_intersect = sum(1 for w in weights if w > 0)
        qmap = {s["calendar_date"]: s["data"] for s in qa["subset"]}
        for s in nd["subset"]:
            cd = s["calendar_date"]
            qd = qmap.get(cd) or []
            num = den = 0.0
            for v, q, w in zip(s["data"], qd, weights):
                if w <= 0 or v == FILL or q not in (0, 1):
                    continue
                num += v * 1e-4 * w
                den += w
            if den <= 0:
                continue
            d = date.fromisoformat(cd)
            out[(product, d)] = {
                "ndvi": num / den, "px_used": sum(
                    1 for v, q, w in zip(s["data"], qd, weights)
                    if w > 0 and v != FILL and q in (0, 1)),
                "px_intersect": px_intersect}
    return out


def pairs(modis, s2_obs):
    """Pair composites with the nearest Sentinel-2 obs within 3 days."""
    s2 = [(date.fromisoformat(o["fecha"]), o["ndvi"]["medio"])
          for o in s2_obs]
    rows = []
    for (product, d), m in sorted(modis.items(), key=lambda x: x[0][1]):
        best = min(s2, key=lambda o: abs((o[0] - d).days), default=None)
        if best and abs((best[0] - d).days) <= PAIR_MAX_DAYS:
            rows.append({"product": product, "modis_date": str(d),
                         "s2_date": str(best[0]),
                         "modis": round(m["ndvi"], 4),
                         "s2": best[1],
                         "diff": round(m["ndvi"] - best[1], 4),
                         "px_used": m["px_used"],
                         "px_intersect": m["px_intersect"]})
    return rows


def stats(rows):
    if not rows:
        return {}
    d = [r["modis"] - r["s2"] for r in rows]
    n = len(d)
    bias = sum(d) / n
    rmse = math.sqrt(sum(x * x for x in d) / n)
    r = None
    if n >= 3:
        mx = sum(r["modis"] for r in rows) / n
        my = sum(r["s2"] for r in rows) / n
        cov = sum((r["modis"] - mx) * (r["s2"] - my) for r in rows)
        sx = math.sqrt(sum((r["modis"] - mx) ** 2 for r in rows))
        sy = math.sqrt(sum((r["s2"] - my) ** 2 for r in rows))
        if sx > 0 and sy > 0:
            r = cov / (sx * sy)
    return {"n": n, "bias": round(bias, 4), "rmse": round(rmse, 4),
            "pearson_r": round(r, 3) if r is not None else None}


def main():
    poly = vineyard_polygon()
    ha = (poly.area * 111320 * 110574
          * math.cos(math.radians(poly.centroid.y)) / 1e4)
    print(f"polygon area: {ha:.0f} ha")
    s2_obs = json.loads(S2.read_text(encoding="utf-8"))["observations"]
    print(f"Sentinel-2 observations: {len(s2_obs)}")
    modis = composites(poly)
    print(f"MODIS composites with data: {len(modis)}")
    rows = pairs(modis, s2_obs)
    for r in rows:
        print(f"  {r['product']} {r['modis_date']} vs S2 {r['s2_date']}: "
              f"MODIS {r['modis']} S2 {r['s2']} diff {r['diff']:+.4f} "
              f"({r['px_used']}/{r['px_intersect']} px)")
    st = stats(rows)
    print("stats:", st)
    OUT.write_text(json.dumps({"pairs": rows, "stats": st},
                              ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(f"written {OUT}")


if __name__ == "__main__":
    main()
