"""Geodesic helpers: spherical polygon area and centroid.

Rings are GeoJSON order: [lon, lat], unclosed (first point not repeated).
"""

import math

EARTH_R_M = 6_371_008.8


def ring_area_ha(ring: list[list[float]]) -> float:
    """Spherical polygon area in hectares (trapezoid approximation)."""
    if len(ring) < 3:
        return 0.0
    total = 0.0
    n = len(ring)
    for i in range(n):
        lon0, lat0 = math.radians(ring[i][0]), math.radians(ring[i][1])
        lon1, lat1 = math.radians(ring[(i + 1) % n][0]), \
            math.radians(ring[(i + 1) % n][1])
        total += (lon1 - lon0) * (2 + math.sin(lat0) + math.sin(lat1))
    return abs(total) * EARTH_R_M ** 2 / 2 / 10_000


def ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    """(lat, lon) — vertex mean, fine for plots << a grid cell."""
    n = len(ring)
    lat = sum(p[1] for p in ring) / n
    lon = sum(p[0] for p in ring) / n
    return lat, lon
