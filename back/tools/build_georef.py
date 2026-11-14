"""Build the small GeoJSON lookups under ``back/data/``.

Outputs (kept under ~1 MB each so they can ship inside the Vercel
function):

- ``back/data/ar_provinces.geojson`` — IGN ``ign:provincia`` WFS layer,
  simplified (Shapely, ~1 km tolerance) with ``nam`` + ``in1`` (INDEC
  province code) properties.
- ``back/data/countries.geojson`` — Natural Earth 110 m admin-0
  (``data/geo/ne110``) with ``iso2`` + ``name``.

Dev-time only: needs ``shapely`` and ``pyshp`` (model venv deps); the
runtime lookup in ``app/services/georef.py`` is stdlib-only.

    python back/tools/build_georef.py [provinces.geojson]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "data"
NE110 = ROOT / "data/geo/ne110/ne_110m_admin_0_countries.shp"
TOL = 0.01          # ~1 km simplification tolerance, degrees
ROUND = 4           # coordinate decimals (~10 m)


def _round_coords(obj):
    if isinstance(obj, (list, tuple)):
        return [_round_coords(x) for x in obj]
    if isinstance(obj, float):
        return round(obj, ROUND)
    return obj


def build_provinces(src: Path) -> Path:
    from shapely.geometry import shape, mapping
    data = json.loads(src.read_text(encoding="utf-8"))
    feats = []
    for f in data["features"]:
        geom = shape(f["geometry"]).simplify(TOL, preserve_topology=True)
        feats.append({
            "type": "Feature",
            "properties": {"nam": f["properties"]["nam"],
                           "in1": f["properties"]["in1"]},
            "geometry": _round_coords(mapping(geom)),
        })
    out = OUT / "ar_provinces.geojson"
    out.write_text(json.dumps(
        {"type": "FeatureCollection", "features": feats},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def build_countries() -> Path:
    import shapefile  # pyshp
    from shapely.geometry import shape, mapping
    rdr = shapefile.Reader(str(NE110))
    fields = [f[0] for f in rdr.fields[1:]]
    feats = []
    for rec in rdr.iterShapeRecords():
        props = dict(zip(fields, rec.record))
        iso2 = props.get("ISO_A2_EH") or props.get("ISO_A2") or ""
        name = props.get("NAME_ES") or props.get("NAME") or ""
        geom = shape(rec.shape.__geo_interface__) \
            .simplify(TOL, preserve_topology=True)
        feats.append({
            "type": "Feature",
            "properties": {"iso2": iso2, "name": name},
            "geometry": _round_coords(mapping(geom)),
        })
    out = OUT / "countries.geojson"
    out.write_text(json.dumps(
        {"type": "FeatureCollection", "features": feats},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src is None:
        print("usage: build_georef.py <ign_provincia.geojson>")
        raise SystemExit(2)
    for p in (build_provinces(src), build_countries()):
        print(f"{p} -> {p.stat().st_size / 1024:.0f} KB")
