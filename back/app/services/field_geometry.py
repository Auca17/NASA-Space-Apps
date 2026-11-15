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


# ------------------------------------------------ large fields ------------

def area_ha(shape) -> float:
    """Spherical area (ha) of a (Multi)Polygon, holes subtracted."""
    from .geodesy import ring_area_ha
    return sum(ring_area_ha(list(p.exterior.coords)[:-1]) -
               sum(ring_area_ha(list(h.coords)[:-1]) for h in p.interiors)
               for p in pieces(shape))


def split_blocks(shape, max_ha: float):
    """Technical blocks of at most ~`max_ha` covering `shape` exactly
    (grid squares intersected with it). They spread the sampling of a
    large field; they are never shown as plots."""
    from math import ceil, cos, radians, sqrt
    if area_ha(shape) <= max_ha:
        return [shape]
    west, south, east, north = shape.bounds
    lat = radians((south + north) / 2)
    side_deg = sqrt(max_ha * 10_000) / 111_194.9 * .97
    rows = max(1, ceil((north - south) / side_deg))
    cols = max(1, ceil((east - west) / (side_deg / max(cos(lat), .1))))
    h, w = (north - south) / rows, (east - west) / cols
    blocks = []
    for r in range(rows):
        for c in range(cols):
            cell = box(west + c * w, south + r * h,
                       west + (c + 1) * w, south + (r + 1) * h)
            part = shape.intersection(cell)
            if not part.is_empty and part.area > 0 and \
                    part.geom_type in ("Polygon", "MultiPolygon"):
                blocks.append(part)
    return blocks


def block_samples(blocks, total: int = 8):
    """Sample points spread over every block: at least two per block and
    the rest in proportion to its area. Weights add up to the area."""
    whole = sum(b.area for b in blocks) or 1
    out = []
    for b in blocks:
        limit = max(2, round(total * b.area / whole))
        out.extend(sample_locations(b, limit=limit))
    return out
