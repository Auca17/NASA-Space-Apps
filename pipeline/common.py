"""Rutas y utilidades compartidas por los pasos del pipeline de fuego."""

from __future__ import annotations

import os
import time
from pathlib import Path

import duckdb

REPO = Path(__file__).resolve().parents[1]

# Zips crudos de FIRMS: fuera del repo (≈9 GB).
RAW = Path(os.environ.get("FIRMS_RAW_DIR", Path.home() / "spaceapps-fuego" / "data" / "raw"))
ZIPS = RAW / "zips"
CSV = RAW / "csv"  # zips descomprimidos

# Salidas intermedias: dentro del repo pero ignoradas por git.
PROCESSED = REPO / "data" / "processed"
HOTSPOTS = PROCESSED / "hotspots"          # 01: crudo normalizado y deduplicado
HOTSPOTS_CLEAN = PROCESSED / "hotspots_clean"  # 02: filtrado + H3 (03)
STATS = PROCESSED / "stats"

# Productos de FIRMS → sensor
PRODUCTS = {
    "modis": "MODIS",
    "viirs-snpp": "VIIRS",
    "viirs-jpss1": "VIIRS",  # NOAA-20
}


def connect(threads: int | None = None) -> duckdb.DuckDBPyConnection:
    """Conexión DuckDB con las extensiones h3 y spatial cargadas."""
    con = duckdb.connect()
    con.sql("INSTALL h3 FROM community; LOAD h3;")
    con.sql("INSTALL spatial; LOAD spatial;")
    con.sql(f"SET threads = {threads or os.cpu_count()}")
    con.sql("SET preserve_insertion_order = false")
    tmp = PROCESSED / "duckdb_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.sql(f"SET temp_directory = '{tmp}'")
    return con


def scalar(con: duckdb.DuckDBPyConnection, query: str):
    """Primer valor de la primera fila (DuckDB 2.0 ya no tiene fetchone en relaciones)."""
    return con.sql(query).fetchall()[0][0]


class Timer:
    def __init__(self, label: str):
        self.label = label

    def __enter__(self):
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *exc):
        print(f"  {self.label}: {time.perf_counter() - self.t0:.1f} s", flush=True)
