"""Validación satélite contra campo con las estaciones de Orin (contrato 2.9, D31).

Compara la temperatura máxima y mínima diaria medida por las estaciones
meteorológicas de Orin (Mendoza) con NASA POWER (T2M_MAX / T2M_MIN, grilla de
0,5° × 0,625°) en el mismo punto y día local.

Solo se validan las variables que tienen medición de campo real. El NDVI de Orin
también es satelital (Sentinel-2), y no hay muestreos de humedad del suelo, así
que `ndvi` y `soil_moisture` no se incluyen (no se inventan).

Entrada: data/orin/estaciones.csv, estaciones_catalogo.csv y lotes.geojson
(salida de pipeline/orin_export.py).
Salida:
  data/processed/export/v1/orin/validation.json   (contrato 2.9, synthetic: false)
  data/processed/export/v1/orin/lots.geojson      (contrato 2.9)
  docs/validation/orin/                           (detalle por estación, gráfico y README)

Uso:  python pipeline/orin_validation.py
"""

from __future__ import annotations

import csv
import json
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from common import PROCESSED, REPO

ORIN = REPO / "data" / "orin"
OUT = PROCESSED / "export" / "v1" / "orin"
DOCS = REPO / "docs" / "validation" / "orin"
CACHE = PROCESSED / "orin_power_cache"
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN"
         "&community=AG&longitude={lon}&latitude={lat}&start={a}&end={b}&format=JSON"
         "&time-standard=LST")
LAPSE = 6.5  # °C por km, gradiente térmico medio (solo para el análisis en docs)
FIELD_SOURCE = "Estaciones meteorológicas Orin (Mendoza)"


def quality(rmse: float) -> str:
    """Juicio simple para temperatura diaria: ≤ 2 °C bueno, ≤ 3,5 °C regular."""
    return "good" if rmse <= 2.0 else "fair" if rmse <= 3.5 else "poor"


def stats(pairs: list[tuple[float, float]]) -> dict:
    """pairs = [(satélite, campo)] -> n, rmse, bias (sat - campo), r."""
    n = len(pairs)
    d = [s - f for s, f in pairs]
    bias = sum(d) / n
    rmse = math.sqrt(sum(x * x for x in d) / n)
    ms = sum(s for s, _ in pairs) / n
    mf = sum(f for _, f in pairs) / n
    cov = sum((s - ms) * (f - mf) for s, f in pairs)
    vs = sum((s - ms) ** 2 for s, _ in pairs)
    vf = sum((f - mf) ** 2 for _, f in pairs)
    r = cov / math.sqrt(vs * vf) if vs and vf else float("nan")
    return {"n": n, "rmse": round(rmse, 2), "bias": round(bias, 2), "r": round(r, 3)}


def power(lat: float, lon: float, a: str, b: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{lat:.4f}_{lon:.4f}_{a}_{b}.json"
    if f.exists():
        return json.loads(f.read_text())
    url = POWER.format(lat=lat, lon=lon, a=a.replace("-", ""), b=b.replace("-", ""))
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                d = json.load(r)
            f.write_text(json.dumps(d))
            return d
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def load_stations():
    cat = {r["estacion_id"]: r for r in csv.DictReader(open(ORIN / "estaciones_catalogo.csv"))}
    obs: dict[str, list[dict]] = {}
    for r in csv.DictReader(open(ORIN / "estaciones.csv")):
        obs.setdefault(r["estacion_id"], []).append(r)
    return cat, obs


def num(x: str):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def main():
    cat, obs = load_stations()
    dates = sorted({r["fecha"] for rows in obs.values() for r in rows})
    a, b = dates[0], dates[-1]

    def fetch(sid):
        r0 = obs[sid][0]
        return sid, power(float(r0["lat"]), float(r0["lon"]), a, b)

    with ThreadPoolExecutor(6) as ex:
        resp = dict(ex.map(fetch, sorted(obs, key=int)))

    rows = []  # detalle por estación-día
    for sid, d in resp.items():
        p = d["properties"]["parameter"]
        fill = d.get("header", {}).get("fill_value", -999.0)
        cell_elev = d["geometry"]["coordinates"][2]
        st_elev = num(cat.get(sid, {}).get("altitud_m"))
        for r in obs[sid]:
            k = r["fecha"].replace("-", "")
            for var, pk, fk in (("temp_max", "T2M_MAX", "t_max"), ("temp_min", "T2M_MIN", "t_min")):
                s, fv = p[pk].get(k), num(r[fk])
                if s is None or s == fill or fv is None:
                    continue
                rows.append({"estacion_id": sid, "nombre": cat.get(sid, {}).get("nombre", ""),
                             "zona": cat.get(sid, {}).get("zona", ""), "fecha": r["fecha"],
                             "variable": var, "satelite": s, "campo": fv,
                             "altitud_estacion_m": st_elev, "altitud_celda_power_m": round(cell_elev, 1)})

    period = f"{a} a {b}"
    variables, detail = [], {}
    for var, ds in (("temp_max", "NASA POWER T2M_MAX"), ("temp_min", "NASA POWER T2M_MIN")):
        sel = [x for x in rows if x["variable"] == var]
        st = stats([(x["satelite"], x["campo"]) for x in sel])
        variables.append({
            "id": var,
            "satellite": {"dataset": ds, "resolution": "0.5° × 0.625°", "period": period},
            "field": {"source": FIELD_SOURCE, "n_sites": len({x["estacion_id"] for x in sel})},
            **st, "unit": "°C", "quality": quality(st["rmse"])})
        # Solo para docs: corrección por altura y desglose por zona
        corr = [(x["satelite"] - LAPSE * (x["altitud_estacion_m"] - x["altitud_celda_power_m"]) / 1000,
                 x["campo"]) for x in sel if x["altitud_estacion_m"] is not None]
        zonas = {}
        for z in sorted({x["zona"] for x in sel}):
            zonas[z] = stats([(x["satelite"], x["campo"]) for x in sel if x["zona"] == z])
        detail[var] = {"crudo": st, "corregido_por_altura": stats(corr), "por_zona": zonas}

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    validation = {"version": "v1", "synthetic": False, "generated_at": now,
                  "source": f"{FIELD_SOURCE}, {len(obs)} estaciones, {period}",
                  "variables": variables}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=1))

    # lots.geojson: solo lotes con polígono real que no son de prueba
    src = json.loads((ORIN / "lotes.geojson").read_text())
    feats = []
    for f in src["features"]:
        pr = f["properties"]
        if pr.get("prueba") is not False or f["geometry"]["type"] != "Polygon":
            continue
        feats.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": pr["id"], "name": f"Viñedo de {pr['area_ha']:.0f} ha, zona {pr['zona']} (Orin)",
            "crop_label": "Viña", "zone": "cuyo", "synthetic": False, "real_data_available": True}})
    (OUT / "lots.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "synthetic": False, "features": feats}, ensure_ascii=False))

    # Detalle para docs
    DOCS.mkdir(parents=True, exist_ok=True)
    with open(DOCS / "pares_estacion_dia.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(sorted(rows, key=lambda x: (int(x["estacion_id"]), x["fecha"], x["variable"])))
    (DOCS / "metricas.json").write_text(json.dumps(detail, ensure_ascii=False, indent=1))
    plot(rows, DOCS / "satelite_vs_estaciones.png")
    print(json.dumps(validation, ensure_ascii=False, indent=1))
    print(json.dumps(detail, ensure_ascii=False, indent=1))
    print(f"lotes: {len(feats)}")


def plot(rows, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.8), constrained_layout=True)
    for ax, var, title in zip(axes, ("temp_max", "temp_min"), ("Temperatura máxima", "Temperatura mínima")):
        sel = [x for x in rows if x["variable"] == var]
        f = [x["campo"] for x in sel]
        s = [x["satelite"] for x in sel]
        far = [x["altitud_estacion_m"] is not None
               and x["altitud_celda_power_m"] - x["altitud_estacion_m"] > 500 for x in sel]
        for flag, color, label in ((False, "#2a6f97", "Celda POWER a la altura de la estación"),
                                   (True, "#c8553d", "Celda POWER > 500 m más alta (incluye cordillera)")):
            ax.scatter([a for a, g in zip(f, far) if g == flag], [b for b, g in zip(s, far) if g == flag],
                       s=10, alpha=0.55, color=color, label=label)
        lo, hi = min(f + s) - 1, max(f + s) + 1
        ax.plot([lo, hi], [lo, hi], color="#888", lw=1, ls="--")
        ax.set(xlim=(lo, hi), ylim=(lo, hi), xlabel="Estación Orin (°C)", ylabel="NASA POWER (°C)", title=title)
        ax.set_aspect("equal")
    axes[0].legend(loc="upper left", fontsize=8, frameon=False)
    fig.savefig(path, dpi=150)


if __name__ == "__main__":
    main()
