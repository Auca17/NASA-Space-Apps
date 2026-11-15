"""Geometry and samples for field-scale and regional sources."""

from collections import defaultdict
from math import floor

import h3
from shapely.geometry import Polygon, box


def pieces(shape):
    return shape.geoms if shape.geom_type == "MultiPolygon" else (shape,)


def cell_weights(shape, resolution):
    overlaps = defaultdict(float)
    for piece in pieces(shape):
        rings = (piece.exterior, *piece.interiors)
        polygon = h3.LatLngPoly(*[[(y, x) for x, y in ring.coords]
                                  for ring in rings])
        for cell in h3.h3shape_to_cells_experimental(polygon, resolution,
                                                     contain="overlap"):
            boundary = Polygon([(x, y) for y, x in h3.cell_to_boundary(cell)])
            area = piece.intersection(boundary).area
            if area:
                overlaps[cell] += area
    return dict(sorted(overlaps.items(), key=lambda item: -item[1]))


def sample_locations(shape, limit=8):
    """Group intersecting cells into bounded area strata, taking interior points."""
    if shape is None:
        return []
    cells = cell_weights(shape, 9)
    total = sum(cells.values())
    strata = {}
    covered = 0
    for cell, weight in sorted(cells.items()):
        index = min(limit - 1, int((covered + weight / 2) * limit / total))
        covered += weight
        previous = strata.get(index, (cell, 0, 0))
        strata[index] = (cell if weight > previous[1] else previous[0],
                         max(weight, previous[1]), previous[2] + weight)
    samples = []
    for cell, _, weight in strata.values():
        boundary = Polygon([(x, y) for y, x in h3.cell_to_boundary(cell)])
        point = shape.intersection(boundary).representative_point()
        samples.append((point.y, point.x, weight))
    return samples


def weather_locations(shape):
    """One interior point per intersecting POWER meteorological grid cell."""
    height, width = .5, .625
    grids = {}
    for part in pieces(shape):
        west, south, east, north = part.bounds
        for row in range(floor(south / height + .5), floor(north / height + .5) + 1):
            for col in range(floor(west / width + .5), floor(east / width + .5) + 1):
                tile = box((col - .5) * width, (row - .5) * height,
                           (col + .5) * width, (row + .5) * height)
                overlap = part.intersection(tile)
                area = overlap.area
                if not area:
                    continue
                previous = grids.get((row, col))
                anchor = overlap.representative_point() if not previous else previous[0]
                grids[(row, col)] = anchor, area + (previous[1] if previous else 0)
    ranked = sorted(grids.items(), key=lambda item: -item[1][1])[:12]
    return [(point.y, point.x, weight, f"power:{row}/{col}")
            for (row, col), (point, weight) in ranked]
