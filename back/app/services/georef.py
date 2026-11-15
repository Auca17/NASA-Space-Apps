"""Plot -> province/zone/country lookup, stdlib-only (Vercel friendly).

Data: ``back/data/ar_provinces.geojson`` (IGN ``ign:provincia``,
simplified ~1 km) and ``back/data/countries.geojson`` (Natural Earth
110 m admin-0) — see ``tools/build_georef.py``.

Zones follow the agronomic regions used by the rotation knowledge:

- pampa_humeda: Buenos Aires, CABA, Córdoba, Santa Fe, Entre Ríos,
  La Pampa
- nea: Corrientes, Misiones, Chaco, Formosa
- noa: Salta, Jujuy, Tucumán, Santiago del Estero, Catamarca, La Rioja
- cuyo: Mendoza, San Juan, San Luis
- patagonia: Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego
"""

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"

# INDEC province code -> zone
_PROVINCE_ZONE = {
    "06": "pampa_humeda",   # Buenos Aires
    "02": "pampa_humeda",   # CABA
    "14": "pampa_humeda",   # Córdoba
    "82": "pampa_humeda",   # Santa Fe
    "30": "pampa_humeda",   # Entre Ríos
    "42": "pampa_humeda",   # La Pampa
    "18": "nea",            # Corrientes
    "54": "nea",            # Misiones
    "22": "nea",            # Chaco
    "34": "nea",            # Formosa
    "66": "noa",            # Salta
    "38": "noa",            # Jujuy
    "90": "noa",            # Tucumán
    "86": "noa",            # Santiago del Estero
    "10": "noa",            # Catamarca
    "46": "noa",            # La Rioja
    "50": "cuyo",           # Mendoza
    "70": "cuyo",           # San Juan
    "74": "cuyo",           # San Luis
    "58": "patagonia",      # Neuquén
    "62": "patagonia",      # Río Negro
    "26": "patagonia",      # Chubut
    "78": "patagonia",      # Santa Cruz
    "94": "patagonia",      # Tierra del Fuego / Antártida / Atlántico Sur
}

ZONES = set(_PROVINCE_ZONE.values()) | {"other"}


@lru_cache(maxsize=1)
def _features(name: str) -> tuple:
    try:
        data = json.loads(
            (DATA / name).read_text(encoding="utf-8"))
    except OSError:
        return ()
    return tuple(data.get("features") or ())


def _rings(geom: dict):
    """Yield (exterior, holes) of (lon, lat) rings for Polygon/Multi."""
    if not geom:
        return
    coords = geom.get("coordinates") or []
    if geom.get("type") == "Polygon":
        polys = [coords]
    else:  # MultiPolygon
        polys = coords
    for poly in polys:
        if poly:
            yield poly[0], poly[1:]


def _in_ring(x: float, y: float, ring) -> bool:
    """Ray casting on a single exterior ring ([lon, lat] pairs)."""
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and \
                x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _feature_at(features, lat: float, lon: float):
    for feat in features:
        for ext, holes in _rings(feat.get("geometry")):
            if _in_ring(lon, lat, ext) and not any(
                    _in_ring(lon, lat, h) for h in holes):
                return feat
    return None


# Enclave fix: without interior rings, Lesotho/San Marino/etc. report
# the enclosing country. Coastal fix: the 110 m country map misses
# points just offshore; snap to the nearest feature within tolerance.
COUNTRY_SNAP_DEG = 0.3

# Natural Earth 110m uses -99 for entities without an ISO A2 code.
_ISO2_OVERRIDES = {
    "República Turca del Norte de Chipre": "CY",
    "Somalilandia": "SO",
}


def _seg_dist(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy)
                     / (dx * dx + dy * dy)))
    return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5


def _ring_dist(x: float, y: float, ring) -> float:
    best = float("inf")
    j = len(ring) - 1
    for i in range(len(ring)):
        d = _seg_dist(x, y, ring[j][0], ring[j][1],
                      ring[i][0], ring[i][1])
        if d < best:
            best = d
        j = i
    return best


def _nearest_feature(features, lat: float, lon: float,
                     tol: float = COUNTRY_SNAP_DEG):
    """Closest feature whose border lies within `tol` degrees."""
    best, best_d = None, tol
    for feat in features:
        pts = [q for ext, _ in _rings(feat.get("geometry"))
               for q in ext]
        if not pts:
            continue
        xs, ys = [q[0] for q in pts], [q[1] for q in pts]
        if not (min(xs) - tol <= lon <= max(xs) + tol
                and min(ys) - tol <= lat <= max(ys) + tol):
            continue
        for ext, _ in _rings(feat.get("geometry")):
            d = _ring_dist(lon, lat, ext)
            if d < best_d:
                best, best_d = feat, d
    return best


def province_at(lat: float, lon: float) -> dict | None:
    """Argentine province at the point: {nam, in1} or None."""
    feat = _feature_at(_features("ar_provinces.geojson"), lat, lon)
    return (feat or {}).get("properties")


def country_at(lat: float, lon: float) -> dict | None:
    """Country at the point: {iso2, name} or None.

    Exact containment first (honoring enclave holes); then, because the
    110 m coastline drops near-shore points, the nearest country within
    COUNTRY_SNAP_DEG of its border.
    """
    feats = _features("countries.geojson")
    feat = _feature_at(feats, lat, lon) or \
        _nearest_feature(feats, lat, lon)
    props = (feat or {}).get("properties")
    if props and props.get("iso2") == "-99":
        props = dict(props, iso2=_ISO2_OVERRIDES.get(props.get("name")))
    return props


def zone_at(lat: float, lon: float) -> dict:
    """{zone, province, country} for a plot centroid.

    Argentina: zone from the province table, country "AR". Outside:
    zone "other", province None, country = ISO A2 when resolvable.
    The ~1 km province map is authoritative near borders: do not let
    the coarse 110 m country map disagree (Posadas read PY).
    """
    prov = province_at(lat, lon)
    if prov:
        return {"zone": _PROVINCE_ZONE.get(prov.get("in1"), "other"),
                "province": prov.get("nam"),
                "country": "AR"}
    country = country_at(lat, lon) or {}
    return {"zone": "other", "province": None,
            "country": country.get("iso2")}
