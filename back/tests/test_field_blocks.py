"""Fields above 5,000 ha: accepted for analysis and processed in
internal blocks (never one central point)."""
import sys
from pathlib import Path

import pytest
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _sq(lat, lon, half_deg):
    return [[lon - half_deg, lat - half_deg], [lon + half_deg, lat - half_deg],
            [lon + half_deg, lat + half_deg], [lon - half_deg, lat + half_deg],
            [lon - half_deg, lat - half_deg]]


def test_parse_plot_accepts_a_12000_ha_field():
    from app.routers.field import parse_plot
    # ~12 km x 10 km around Pergamino (~12,000 ha)
    (_, ha, *_rest, geom), err = parse_plot({"polygon": {
        "type": "Polygon", "coordinates": [_sq(-33.96, -60.69, 0.0545)]}})
    assert err is None
    assert 11_500 < ha < 12_800
    assert geom is not None


def test_parse_plot_still_bounds_analysis_and_points():
    from app.routers.field import parse_plot, MAX_ANALYSIS_HA
    _, err = parse_plot({"polygon": {"coordinates": [_sq(-33.0, -61.0, 0.45)]}})
    assert err is not None and err.status_code == 400  # > MAX_ANALYSIS_HA
    assert MAX_ANALYSIS_HA >= 12_000
    _, err = parse_plot({"point": [-33.9, -60.6], "ha": 6000})
    assert err is not None and err.status_code == 400


def test_split_blocks_covers_the_field_in_manageable_blocks():
    from app.services.field_geometry import split_blocks, area_ha
    field = Polygon(_sq(-33.96, -60.69, 0.0495)[:-1])
    blocks = split_blocks(field, 5_000)
    assert len(blocks) >= 3
    total = sum(area_ha(b) for b in blocks)
    assert total == pytest.approx(area_ha(field), rel=1e-6)
    assert all(area_ha(b) <= 5_000 * 1.05 for b in blocks)
    # blocks do not overlap
    for i, a in enumerate(blocks):
        for b in blocks[i + 1:]:
            assert a.intersection(b).area < 1e-12


def test_split_blocks_keeps_small_fields_whole_and_respects_holes():
    from app.services.field_geometry import split_blocks, area_ha
    small = box(-60.70, -33.97, -60.68, -33.95)
    assert split_blocks(small, 5_000) == [small]
    holed = Polygon(_sq(-33.96, -60.69, 0.0495)[:-1],
                    [_sq(-33.96, -60.69, 0.01)[:-1]])
    blocks = split_blocks(holed, 5_000)
    assert sum(area_ha(b) for b in blocks) == pytest.approx(area_ha(holed), rel=1e-6)
    assert not any(b.contains(Polygon(_sq(-33.96, -60.69, 0.005)[:-1]).centroid)
                   for b in blocks)


def test_block_samples_spread_over_every_block():
    from app.services.field_geometry import split_blocks, block_samples
    field = Polygon(_sq(-33.96, -60.69, 0.0495)[:-1])
    blocks = split_blocks(field, 5_000)
    points = block_samples(blocks)
    assert len(points) >= 2 * len(blocks)
    for b in blocks:
        assert any(b.buffer(1e-9).contains(
            Polygon(_sq(lat, lon, 1e-6)[:-1]).centroid) for lat, lon, _ in points)
    assert sum(w for *_, w in points) == pytest.approx(field.area, rel=1e-6)


# found in the browser: plot outlines traced from map cells can touch
# themselves at a corner, and neighbouring plots share edges; both were
# rejected with 400 when the whole-field summary sent them together

def test_parse_plot_accepts_neighbour_plots_sharing_an_edge():
    from app.routers.field import parse_plot
    a = [[-60.70, -33.97], [-60.69, -33.97], [-60.69, -33.96], [-60.70, -33.96], [-60.70, -33.97]]
    b = [[-60.69, -33.97], [-60.68, -33.97], [-60.68, -33.96], [-60.69, -33.96], [-60.69, -33.97]]
    (_, ha, *_r, geom), err = parse_plot({"polygon": {"type": "MultiPolygon",
                                                      "coordinates": [[a], [b]]}})
    assert err is None and geom.is_valid
    (_, ha_a, *_), _ = parse_plot({"polygon": {"coordinates": [a]}})
    assert ha == pytest.approx(2 * ha_a, rel=1e-6)


def test_parse_plot_accepts_a_ring_touching_itself_at_a_corner():
    from app.routers.field import parse_plot
    # two squares joined at one vertex, traced as one ring
    ring = [[-60.70, -33.97], [-60.69, -33.97], [-60.69, -33.96],
            [-60.68, -33.96], [-60.68, -33.95], [-60.69, -33.95],
            [-60.69, -33.96], [-60.70, -33.96], [-60.70, -33.97]]
    (_, ha, *_r, geom), err = parse_plot({"polygon": {"coordinates": [ring]}})
    assert err is None and geom.is_valid and ha > 0


def test_parse_plot_still_rejects_overlapping_pieces():
    from app.routers.field import parse_plot
    a = [[-60.70, -33.97], [-60.68, -33.97], [-60.68, -33.95], [-60.70, -33.95], [-60.70, -33.97]]
    b = [[-60.69, -33.96], [-60.67, -33.96], [-60.67, -33.94], [-60.69, -33.94], [-60.69, -33.96]]
    _, err = parse_plot({"polygon": {"type": "MultiPolygon", "coordinates": [[a], [b]]}})
    assert err is not None and err.status_code == 400


def test_parse_plot_tolerates_sliver_overlaps_between_plots():
    from app.routers.field import parse_plot
    from app.services.field_geometry import area_ha
    from shapely.geometry import Polygon
    a = [[-60.70, -33.97], [-60.6899, -33.97], [-60.6899, -33.96], [-60.70, -33.96], [-60.70, -33.97]]
    b = [[-60.69, -33.97], [-60.68, -33.97], [-60.68, -33.96], [-60.69, -33.96], [-60.69, -33.97]]
    (_, ha, *_r, geom), err = parse_plot({"polygon": {"type": "MultiPolygon",
                                                      "coordinates": [[a], [b]]}})
    assert err is None
    assert ha == pytest.approx(area_ha(Polygon(a[:-1]).union(Polygon(b[:-1]))), rel=1e-6)
