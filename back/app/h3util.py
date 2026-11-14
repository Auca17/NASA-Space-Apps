"""lat/lon -> H3 index helpers (res 2 shard, res 5 panel, res 6 api cache)."""

import h3


def cell(lat: float, lon: float, res: int) -> str:
    return h3.latlng_to_cell(lat, lon, res)


def h3_r2(lat: float, lon: float) -> str:
    return cell(lat, lon, 2)


def h3_r5(lat: float, lon: float) -> str:
    return cell(lat, lon, 5)


def h3_r6(lat: float, lon: float) -> str:
    return cell(lat, lon, 6)
