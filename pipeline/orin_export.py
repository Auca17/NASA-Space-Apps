"""B3 — Export de los datos de Orin que están en su repositorio (D17).

Toma DATOS del repositorio de Orin (no su código) y los deja en data/orin/
con el formato del brief B3. Lo que solo vive en Firestore (polígonos reales de
los lotes y muestreos de campo) no está acá: el README lo deja explícito.

Fuentes dentro del repo de Orin:
  vesta/lib/stations/catalog.ts        catálogo de 67 estaciones (DCC Mendoza)
  vesta/lib/stations/readingsData.ts   tmin / tmax diarias, últimos 14 días por estación
  validation/prospectivo/              pronóstico calibrado de mínimas (sesgos por estación)
  investigacion/umbrales_agronomicos.json   42 umbrales con fuente
  vesta/lib/geo/activeParcel.ts        lote de demo (bbox)
  vesta/components/FieldSamplingModal.tsx   punto de demo en Valle de Uco

Uso:  python pipeline/orin_export.py <ruta al repo de Orin> [<carpeta orin_export de Firestore>]

Con la carpeta de Firestore (export de un usuario de la app, ver
~/spaceapps-fuego/orin-client-export/export.mjs) se suman los polígonos reales de
los lotes, los índices satelitales que Orin calculó por lote y los muestreos.
Salida: data/orin/ (no va a git)
"""

from __future__ import annotations

import csv
import json
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "orin"


def parse_catalog(src: Path) -> list[dict]:
    txt = (src / "vesta/lib/stations/catalog.ts").read_text()
    rows = []
    pat = re.compile(
        r'\{\s*id:\s*(\d+),\s*nombre:\s*"([^"]*)",\s*departamento:\s*"([^"]*)",\s*zona:\s*(null|"[^"]*"),'
        r'\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+),\s*altitudM:\s*(null|-?[\d.]+),\s*publicada:\s*(true|false)')
    for m in pat.finditer(txt):
        lat, lon = float(m[5]), float(m[6])
        valid = not (lat == 0.0 and lon == 0.0)
        rows.append({
            "estacion_id": int(m[1]), "nombre": m[2], "departamento": m[3],
            "zona": None if m[4] == "null" else m[4].strip('"'),
            "lat": lat if valid else None, "lon": lon if valid else None,
            "altitud_m": None if m[7] == "null" else float(m[7]),
            "publicada": m[8] == "true",
        })
    return rows


def parse_readings(src: Path) -> tuple[str | None, dict[int, list]]:
    txt = (src / "vesta/lib/stations/readingsData.ts").read_text()
    hasta = re.search(r'SNAPSHOT_HASTA\s*=\s*"([^"]+)"', txt)
    data = {}
    for m in re.finditer(r"^\s*(\d+):\s*\[(.*)\],\s*$", txt, re.M):
        data[int(m[1])] = [(d, float(tmin), float(tmax))
                           for d, tmin, tmax in re.findall(r'\["([\d-]+)",(-?[\d.]+),(-?[\d.]+)\]', m[2])]
    return (hasta[1] if hasta else None), data


def frost_thresholds(src: Path) -> tuple[list, list]:
    rules = json.loads((src / "investigacion/umbrales_agronomicos.json").read_text())
    frost = []
    for r in rules:
        regla = r.get("regla", "")
        if "helada" in regla or regla.startswith("ajuste_tmin"):
            frost.append({
                "cultivo": "vid",
                "regla": r.get("regla"),
                "variable": r.get("variable"),
                "operador": r.get("operador"),
                "umbral": r.get("umbral"),
                "unidad": r.get("unidad"),
                "etapas": r.get("etapas"),
                "significado": r.get("significado"),
                "recomendacion": r.get("recomendacion"),
                "fuente": r.get("fuente"),
                "confianza": r.get("confianza"),
            })
    return rules, frost


def demo_plots(src: Path, stations: list[dict]) -> dict:
    feats = []
    ap = (src / "vesta/lib/geo/activeParcel.ts").read_text()
    m = re.search(r"DEFAULT_BBOX:\s*Bbox\s*=\s*\[([^\]]+)\]", ap)
    name = re.search(r"//\s*(.+?),\s*Mendoza\s*\n\s*export const DEFAULT_BBOX", ap)
    if m:
        x0, y0, x1, y1 = (float(v) for v in m[1].split(","))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[
            [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]},
            "properties": {"id": "orin-demo-1", "nombre": name[1] if name else "Lote de demo Orin",
                           "cultivo_actual": "vid", "zona": nearest_zone(cy, cx, stations),
                           "geometria": "rectángulo envolvente (bbox) del lote de demo, no el polígono real",
                           "fuente": "Orin, vesta/lib/geo/activeParcel.ts"}})
    fs = (src / "vesta/components/FieldSamplingModal.tsx").read_text()
    m = re.search(r"coordinates:\s*\[(-?[\d.]+),\s*(-?[\d.]+)\],\s*//\s*(.+)", fs)
    if m:
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(m[1]), float(m[2])]},
                      "properties": {"id": "orin-demo-2", "nombre": f"Punto de muestreo de demo ({m[3].strip()})",
                                     "cultivo_actual": "vid", "zona": nearest_zone(float(m[2]), float(m[1]), stations),
                                     "geometria": "punto, sin polígono",
                                     "fuente": "Orin, vesta/components/FieldSamplingModal.tsx"}})
    return {"type": "FeatureCollection", "features": feats}


def nearest_zone(lat: float, lon: float, stations: list[dict]) -> str | None:
    best = min((s for s in stations if s["lat"] is not None and s["zona"]),
               key=lambda s: (s["lat"] - lat) ** 2 + (s["lon"] - lon) ** 2, default=None)
    return best["zona"] if best else None


def firestore_plots(fs_dir: Path, stations: list[dict]) -> list[dict]:
    feats = []
    for l in json.loads((fs_dir / "lotes.json").read_text()):
        pts = l["polygon"]["rings"][0]["points"]
        ring = [[p["lon"], p["lat"]] for p in pts]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        cx = sum(p[0] for p in ring[:-1]) / (len(ring) - 1)
        cy = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
        name = l.get("name") or l["parcel_id"]
        feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                      "properties": {"id": l["parcel_id"], "nombre": name, "cultivo_actual": "vid",
                                     "zona": nearest_zone(cy, cx, stations), "area_ha": l.get("areaHa"),
                                     "prueba": "prueb" in name.lower() or "prubas" in name.lower(),
                                     "geometria": "polígono real dibujado en Orin",
                                     "fuente": "Orin, Firestore users/{uid}/parcels"}})
    return feats


def firestore_observations(fs_dir: Path) -> int:
    rows = json.loads((fs_dir / "observaciones.json").read_text())
    cols = ["lote_id", "fecha", "plataforma", "fuente", "confiable", "cobertura_valida_pct",
            "pixeles_validos", "ndvi_medio", "ndvi_p10", "ndvi_p50", "ndvi_p90", "ndvi_desvio",
            "ndmi_medio", "ndre_medio"]
    with open(OUT / "observaciones_satelitales.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for o in sorted(rows, key=lambda r: (r["parcel_id"], r["fecha"])):
            nd = o.get("ndvi") or {}
            w.writerow([o["parcel_id"], o.get("fecha_toma") or o["fecha"], o.get("plataforma"), o.get("fuente"),
                        o.get("confiable"), o.get("cobertura_valida_pct"), o.get("pixeles_validos"),
                        nd.get("medio"), nd.get("p10"), nd.get("p50"), nd.get("p90"), nd.get("desvio"),
                        o.get("ndmi_medio"), o.get("ndre_medio")])
    return len(rows)


def firestore_samples(fs_dir: Path) -> int:
    rows = json.loads((fs_dir / "muestreos.json").read_text())
    units = {"peso_poda": "kg", "rendimiento_kg": "kg", "solidos_solubles": "°Brix", "ndvi_dron": "adimensional"}
    with open(OUT / "muestreos.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lote_id", "fecha", "variable", "valor", "unidad", "metodo"])
        for m in rows:
            w.writerow([m.get("id_parcela"), (m.get("fecha_registro") or "")[:10], m.get("variable"),
                        m.get("valor"), units.get(m.get("variable")), m.get("metodo")])
    return len(rows)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: python pipeline/orin_export.py <ruta al repo de Orin>")
    src = Path(sys.argv[1]).expanduser()
    OUT.mkdir(parents=True, exist_ok=True)

    stations = parse_catalog(src)
    with open(OUT / "estaciones_catalogo.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(stations[0]))
        w.writeheader(); w.writerows(stations)

    hasta, readings = parse_readings(src)
    by_id = {s["estacion_id"]: s for s in stations}
    n_obs = 0
    with open(OUT / "estaciones.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["estacion_id", "lat", "lon", "fecha", "t_max", "t_min", "precip_mm", "hr"])
        for sid in sorted(readings):
            s = by_id.get(sid, {})
            for d, tmin, tmax in readings[sid]:
                w.writerow([sid, s.get("lat"), s.get("lon"), d, tmax, tmin, "", ""])
                n_obs += 1
    dates = sorted({d for v in readings.values() for d, _, _ in v})

    rules, frost = frost_thresholds(src)
    (OUT / "umbrales_helada.json").write_text(json.dumps(frost, indent=2, ensure_ascii=False))
    (OUT / "umbrales_agronomicos.json").write_text(json.dumps(rules, indent=2, ensure_ascii=False))

    fs_dir = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else None
    lotes = demo_plots(src, stations)
    if fs_dir:
        lotes["features"] = firestore_plots(fs_dir, stations) + lotes["features"]
    (OUT / "lotes.geojson").write_text(json.dumps(lotes, indent=2, ensure_ascii=False))

    n_obs_sat = n_samples = 0
    if fs_dir:
        n_obs_sat = firestore_observations(fs_dir)
        n_samples = firestore_samples(fs_dir)
    else:
        with open(OUT / "muestreos.csv", "w", newline="") as f:
            csv.writer(f).writerow(["lote_id", "fecha", "variable", "valor", "unidad", "metodo"])

    pro = OUT / "prospectivo"
    shutil.rmtree(pro, ignore_errors=True)
    shutil.copytree(src / "validation/prospectivo", pro)

    readme = f"""# Datos de Orin para Fuego y Campo (B3)

**Para el README público:** datos recolectados antes del hackatón; se usan los datos, no el código.

Orin es un proyecto previo de monitoreo satelital y calibración para viñedos de Mendoza (cátedra Diseño de Base de Datos II, Universidad de Mendoza, 2026). Su uso está autorizado (D17). De Orin se toman solamente datos; ninguna línea de su código forma parte de este proyecto.

## Qué hay

| Archivo | Contenido | Período | Origen |
|---|---|---|---|
| `estaciones_catalogo.csv` | {len(stations)} estaciones meteorológicas de Mendoza: id, nombre, departamento, zona, lat/lon, altitud | — | Catálogo de la red de la Dirección de Contingencias Climáticas (DCC) de Mendoza, tal como lo compila Orin (`disenodebasesdedatos2/datos/estaciones.csv`) |
| `estaciones.csv` | Temperatura mínima y máxima diaria medida en las estaciones (formato del brief B3; `precip_mm` y `hr` vacíos: no están en el repo) | {dates[0]} → {dates[-1]} ({len(readings)} estaciones, {n_obs} observaciones) | Observaciones diarias DCC Mendoza (`obs_diaria.csv`), recorte de 14 días que Orin guarda en su repo |
| `umbrales_helada.json` | {len(frost)} umbrales de helada para vid, por estado fenológico, con su fuente | — | Investigación de Orin (INIA Chile, FAO 2005 y otras fuentes citadas en cada regla) |
| `umbrales_agronomicos.json` | Las {len(rules)} reglas completas (helada, calor, humedad, enfermedades, NDVI) con fuente | — | Idem |
| `lotes.geojson` | {len(lotes['features'])} lugares: los lotes dibujados en Orin con su polígono real (si se pasó el export de Firestore; `prueba = true` marca los de prueba) y los dos lugares de demo de la configuración | — | Firestore de Orin (`users/{{uid}}/parcels`) y configuración de demo |
| `observaciones_satelitales.csv` | {n_obs_sat} observaciones de índices Sentinel-2 por lote y fecha (NDVI con percentiles, NDMI, NDRE, cobertura válida), calculadas por Orin | {'ver archivo' if n_obs_sat else '—'} | Firestore de Orin (`observaciones`), Sentinel-2 L2A vía Copernicus Data Space |
| `prospectivo/` | Pronóstico de temperatura mínima calibrado con sesgos por estación y por zona (3 noches) y pronóstico horario | emitido 2026-09-27 | Validación prospectiva de Orin |
| `muestreos.csv` | {n_samples} muestreos de campo{' (solo encabezado: la cuenta exportada no tiene muestreos)' if n_samples == 0 else ''} | — | Firestore de Orin (`users/{{uid}}/muestreos`) |

## Cómo se recolectaron

- Las temperaturas son mediciones de estaciones de superficie de la red DCC de Mendoza, agregadas a mínima y máxima diarias.
- Los umbrales son una revisión bibliográfica: cada regla tiene su fuente y un nivel de confianza.
- El pronóstico prospectivo compara pronósticos numéricos con las estaciones para estimar el sesgo de cada estación y zona.

## Qué falta

- **Muestreos de campo** (peso de poda, rendimiento, sólidos solubles, NDVI de dron): la cuenta de Orin exportada no tiene ninguno. Si existen, están en otra cuenta de Orin.
- **Lotes de otras cuentas:** el export de Firestore se hizo con un usuario de la app, que solo puede leer sus propios lotes.
- **Historial completo de estaciones:** acá hay 14 días; el historial está en `obs_diaria.csv` del proyecto `disenodebasesdedatos2`.

## Uso previsto

- **B4, satélite vs. campo:** comparar la temperatura de las estaciones con NASA POWER (T2M_MIN, T2M_MAX) y con MODIS LST en los mismos puntos y días.
- **Heladas:** los umbrales por estado fenológico alimentan la tarjeta de heladas del diagnóstico para viñedos.

Generado con `python pipeline/orin_export.py <repo de Orin>`. Snapshot de estaciones hasta {hasta}.
"""
    (OUT / "README.md").write_text(readme)
    for f in sorted(OUT.rglob("*")):
        if f.is_file():
            print(f"{f.stat().st_size / 1024:8.1f} KB  {f.relative_to(OUT)}")
    print(f"estaciones {len(stations)}, con lecturas {len(readings)}, observaciones {n_obs}, "
          f"umbrales helada {len(frost)}/{len(rules)}, lotes {len(lotes['features'])}")


if __name__ == "__main__":
    main()
