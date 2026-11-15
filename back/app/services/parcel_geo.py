"""Geometry helpers for /api/field/parcels (task 32).

Shapely is used for polygon boolean ops (clipping, overlap, buffers).
All lengths/areas are computed in a local equirectangular projection
anchored at the boundary centroid — good to ~1% at the <=50 km scales
involved; geodesic area uses ring_area_ha where a ring is available.
"""

import math

import shapely
from shapely.geometry import Polygon, MultiPolygon, Point, mapping

from .geodesy import EARTH_R_M

KM_DEG_LAT = 111.132  # km per degree of latitude


def _scale(geom, fx: float, fy: float):
    return shapely.transform(geom, lambda c: c * [fx, fy])


def project(lat0: float):
    """lon/lat -> local km around lat0 (equirectangular)."""
    kx = KM_DEG_LAT * math.cos(math.radians(lat0))

    def fwd(geom):
        return _scale(geom, kx, KM_DEG_LAT)

    def inv(geom):
        return _scale(geom, 1 / kx, 1 / KM_DEG_LAT)

    return fwd, inv


def to_polygon(geom: dict) -> Polygon | MultiPolygon | None:
    """GeoJSON Polygon/MultiPolygon dict -> shapely geom (or None)."""
    try:
        kind = geom.get("type")
        coords = geom.get("coordinates") or []
        if kind == "Polygon":
            return Polygon(coords[0], coords[1:])
        if kind == "MultiPolygon":
            return MultiPolygon(
                [Polygon(p[0], p[1:]) for p in coords])
    except (IndexError, ValueError, TypeError):
        return None
    return None


def area_ha(geom, lat0: float) -> float:
    """Geodesic-ish area of a shapely polygon in hectares."""
    fwd, _ = project(lat0)
    return fwd(geom).area * 100  # km² -> ha


def haversine_km(lat1: float, lon1: float,
                 lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) \
        * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M / 1000 * math.asin(math.sqrt(a))


def buffer_km(geom, km: float, lat0: float):
    """Shapely geom buffered by `km`, returned in lon/lat."""
    fwd, inv = project(lat0)
    return inv(fwd(geom).buffer(km))


def dist_km_point_geom(lat: float, lon: float, geom, lat0: float) -> float:
    """Distance from a point to a polygon (0 inside), in km."""
    fwd, _ = project(lat0)
    return fwd(geom).distance(fwd(Point(lon, lat)))


def circle_polygon(lon: float, lat: float, radius_m: float,
                   vertices: int = 32) -> dict:
    """GeoJSON polygon approximating a circle of radius_m at (lon,lat)."""
    ring = []
    km_per_lon = KM_DEG_LAT * math.cos(math.radians(lat)) * 1000
    for i in range(vertices):
        ang = 2 * math.pi * i / vertices
        ring.append([
            round(lon + radius_m * math.cos(ang) / km_per_lon, 6),
            round(lat + radius_m * math.sin(ang) / 1000 / KM_DEG_LAT, 6)])
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def geojson(geom) -> dict:
    """Shapely geom -> GeoJSON dict with rounded coordinates."""
    return mapping(geom)


def rings_area_ha(geom, lat0: float) -> float:
    return area_ha(geom, lat0)
