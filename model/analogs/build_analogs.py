"""Build field/analogs/{h3_r2}.json (contract 2.8) — analog-zone clusters.

Pipeline:
  1. Feature matrix from data/processed/field/grid/*.json:
     rain_mm_yr, rain_cv, rain_p25_mm, heavy_days_yr, frost_free length
     (days), hot_days_gt35, bare_soil_days_yr, soil texture one-hots,
     soil soc_g_kg, latitude. Nulls -> median imputation (imputed share
     per feature is reported).
  2. KMeans k in [12, 30], standardized features, silhouette on a fixed
     3,000-cell sample, random_state=42 -> reproducible labels.
  3. Neutral-Spanish label per cluster from cluster means via template.
  4. MAGyP Estimaciones Agricolas (latest campaign, department level) +
     IGN department polygons: each cell takes the department of its
     centroid; per cluster, planted-area share and production-weighted
     mean yield for soja/maiz/trigo/girasol/sorgo.

Sources (all public, no auth):
  - MAGyP CKAN dataset estimaciones-agricolas, latest CSV resource.
  - IGN WFS ign:departamento GeoJSON (property in1 = INDEC dept code).
"""

import csv
import io
import json
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import h3
import numpy as np
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

ROOT = Path(__file__).resolve().parents[2]
GRID_DIR = ROOT / "data/processed/field/grid"
OUT_DIR = ROOT / "data/processed/field/analogs"
DEPT_GEO = ROOT / "data/geo/departamentos_ign.geojson"
MAGYP_CSV = ROOT / "data/earthdata/magyp_estimaciones.csv"
MAGYP_PKG = ("https://datos.magyp.gob.ar/api/3/action/package_show"
             "?id=estimaciones-agricolas")
IGN_WFS = ("https://wms.ign.gob.ar/geoserver/ign/ows?service=WFS"
           "&version=1.0.0&request=GetFeature"
           "&typeName=ign%3Adepartamento"
           "&outputFormat=application%2Fjson")

MODEL_VERSION = "analogs-kmeans-0.1"
K_RANGE = range(12, 31)
SEED = 42
TARGET_CROPS = {"soja": "soja", "maiz": "maiz",
                "trigo": "trigo", "girasol": "girasol", "sorgo": "sorgo"}


def crop_of(cultivo):
    n = norm(cultivo)
    for key, out in TARGET_CROPS.items():
        if key in n:
            return out
    return None

NUM_FEATS = ["rain_mm_yr", "rain_cv", "rain_p25_mm", "heavy_days_yr",
             "frost_free_len", "hot_days_gt35", "bare_soil_days_yr",
             "soc_g_kg", "lat"]
TEX_ORDER = ["Arenoso", "Franco", "Franco-arenoso", "Franco-arcilloso",
             "Franco-limoso", "Arcilloso"]


def load_cells():
    cells = {}
    for fp in sorted(GRID_DIR.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        for cid, c in d["cells"].items():
            cells[cid] = c
    return cells


def frost_len(ff):
    if not ff:
        return None
    import datetime as dt
    a = dt.date(2001, int(ff["start"][:2]), int(ff["start"][3:]))
    b = dt.date(2001, int(ff["end"][:2]), int(ff["end"][3:]))
    d = (b - a).days % 365
    return d if d else 365


def feature_matrix(cids, cells):
    """Rows: NUM_FEATS + texture one-hots. Returns (X, imputed shares)."""
    X = np.full((len(cids), len(NUM_FEATS) + len(TEX_ORDER)),
                np.nan, np.float32)
    for i, cid in enumerate(cids):
        c = cells[cid]
        lat, _ = h3.cell_to_latlng(cid)
        vals = {"rain_mm_yr": c.get("rain_mm_yr"),
                "rain_cv": c.get("rain_cv"),
                "rain_p25_mm": c.get("rain_p25_mm"),
                "heavy_days_yr": c.get("heavy_days_yr"),
                "frost_free_len": frost_len(c.get("frost_free")),
                "hot_days_gt35": c.get("hot_days_gt35"),
                "bare_soil_days_yr": c.get("bare_soil_days_yr"),
                "soc_g_kg": (c.get("soil") or {}).get("soc_g_kg"),
                "lat": lat}
        for j, f in enumerate(NUM_FEATS):
            if vals[f] is not None:
                X[i, j] = vals[f]
        tex = (c.get("soil") or {}).get("texture")
        base = len(NUM_FEATS)
        if tex is None:
            continue  # all texture one-hots stay NaN -> imputed
        X[i, base:] = 0.0
        if tex in TEX_ORDER:
            X[i, base + TEX_ORDER.index(tex)] = 1.0
    imputed = {}
    for j, name in enumerate(
            NUM_FEATS + [f"tex_{t}" for t in TEX_ORDER]):
        share = float(np.isnan(X[:, j]).mean())
        if share:
            med = np.nanmedian(X[:, j])
            X[np.isnan(X[:, j]), j] = med
            imputed[name] = round(share, 4)
    return X, imputed


def pick_k(X):
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler
    Xs = StandardScaler().fit_transform(X)
    best = None
    for k in K_RANGE:
        km = KMeans(n_clusters=k, random_state=SEED, n_init=10).fit(Xs)
        s = silhouette_score(Xs, km.labels_, sample_size=3000,
                             random_state=SEED)
        print(f"  k={k}: silhouette={s:.3f}", flush=True)
        if best is None or s > best[1]:
            best = (k, s, km)
    return best


def cluster_labels(km, cids, cells, feat_names):
    """Template label per cluster: rain, frost, dominant texture."""
    labels = {}
    for k in range(km.n_clusters):
        idx = [i for i, l in enumerate(km.labels_) if l == k]
        means = {f: float(np.mean(
            [cells[cids[i]].get(f) for i in idx
             if cells[cids[i]].get(f) is not None] or [np.nan]))
            for f in ("rain_mm_yr", "hot_days_gt35")}
        ffl = [frost_len(cells[cids[i]].get("frost_free"))
               for i in idx]
        ffl = [v for v in ffl if v is not None]
        ff_mean = float(np.mean(ffl)) if ffl else np.nan
        tex = Counter((cells[cids[i]].get("soil") or {}).get("texture")
                      for i in idx
                      if (cells[cids[i]].get("soil") or {}).get("texture"))
        tex = tex.most_common(1)[0][0] if tex else "mixto"
        rain = means["rain_mm_yr"]
        rdesc = ("seco" if rain < 550 else
                 "subhúmedo" if rain < 1000 else "húmedo")
        fdesc = ("casi sin heladas" if ff_mean >= 300 else
                 "heladas cortas" if ff_mean >= 220 else
                 "heladas largas")
        soil = tex.lower().replace("-", " ") if tex else "mixto"
        labels[k] = f"{rdesc}, {fdesc}, suelo {soil}"
    return labels


def fetch(url, dest, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "analogs/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def magyp_csv():
    if MAGYP_CSV.exists():
        return MAGYP_CSV
    pkg = json.loads(urllib.request.urlopen(
        urllib.request.Request(MAGYP_PKG,
                               headers={"User-Agent": "analogs/0.1"}),
        timeout=30).read())
    csvs = [r for r in pkg["result"]["resources"]
            if (r.get("format") or "").upper() == "CSV"
            and "estimaciones-agricolas" in (r.get("url") or "")]
    if not csvs:
        raise RuntimeError("no estimaciones CSV resource found")
    return fetch(sorted(csvs, key=lambda r: r["url"])[-1]["url"],
                 MAGYP_CSV)


def dept_polygons():
    """INDEC code -> list of (lon,lat) exterior rings."""
    if not DEPT_GEO.exists():
        fetch(IGN_WFS, DEPT_GEO, timeout=300)
    d = json.loads(DEPT_GEO.read_text(encoding="utf-8"))
    out = {}
    for f in d["features"]:
        code = f["properties"].get("in1")
        g = f.get("geometry") or {}
        polys = (g.get("coordinates") or [])
        if g.get("type") == "Polygon":
            polys = [polys]
        rings = [p[0] for p in polys if p]
        if code and rings:
            out[code] = rings
    return out


def dept_of(lat, lon, polys, paths_cache):
    """Department INDEC code whose polygon contains (lat, lon)."""
    from matplotlib.path import Path as MplPath
    best = None
    for code, rings in polys.items():
        for ri, ring in enumerate(rings):
            path = paths_cache.get((code, ri))
            if path is None:
                arr = np.asarray(ring)
                path = (MplPath(arr[:, :2]), arr[:, 0].min(),
                        arr[:, 0].max(), arr[:, 1].min(), arr[:, 1].max())
                paths_cache[(code, ri)] = path
            p, x0, x1, y0, y1 = path
            if x0 <= lon <= x1 and y0 <= lat <= y1 and \
                    p.contains_point((lon, lat)):
                return code
    return best


def norm(s):
    return unicodedata.normalize("NFKD", s or "").encode(
        "ascii", "ignore").decode().lower().strip()


def magyp_latest(path):
    """Latest campaign -> dept -> {crop: (sembrada_ha, produccion_tm)}."""
    rows = list(csv.DictReader(io.TextIOWrapper(
        io.BytesIO(path.read_bytes()), encoding="utf-8-sig")))
    camps = sorted({r["campania"] for r in rows if r.get("campania")})
    latest = camps[-1]
    per = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
    for r in rows:
        if r["campania"] != latest:
            continue
        crop = crop_of(r["cultivo"])
        dept = (r.get("departamento_id") or "").strip()
        if not crop or not dept:
            continue
        a = per[dept][crop]
        try:
            a[0] += float(r["superficie_sembrada_ha"] or 0)
        except ValueError:
            pass
        try:
            a[1] += float(r["produccion_tm"] or 0)
        except ValueError:
            pass
    return latest, per


def cluster_crops(cluster_cells, cell_dept, dept_crops, campaign):
    """Per cluster: share + weighted yield per target crop."""
    ha = defaultdict(lambda: defaultdict(float))
    tm = defaultdict(lambda: defaultdict(float))
    for k, cids in cluster_cells.items():
        for cid in cids:
            for crop, (s, p) in dept_crops.get(
                    cell_dept.get(cid), {}).items():
                ha[k][crop] += s
                tm[k][crop] += p
    out = {}
    for k, crops in ha.items():
        tot = sum(crops.values())
        out[k] = [{"crop": c, "share": round(s / tot, 2) if tot else 0,
                   "yield_kg_ha": round(tm[k][c] * 1000 / s)
                   if s else 0,
                   "src": f"MAGyP {campaign}"}
                  for c, s in sorted(crops.items(), key=lambda kv: -kv[1])
                  if s > 0]
    return out


def main():
    t0 = __import__("time").monotonic()
    cells = load_cells()
    cids = sorted(cells)
    print(f"{len(cids)} cells", flush=True)

    X, imputed = feature_matrix(cids, cells)
    print("imputed shares:", imputed, flush=True)

    k, sil, km = pick_k(X)
    print(f"chosen k={k} silhouette={sil:.3f}", flush=True)
    labels = cluster_labels(km, cids, cells, NUM_FEATS)

    csv_path = magyp_csv()
    campaign, dept_crops = magyp_latest(csv_path)
    polys = dept_polygons()
    cache = {}
    cell_dept = {}
    for cid in cids:
        lat, lon = h3.cell_to_latlng(cid)
        cell_dept[cid] = dept_of(lat, lon, polys, cache)
    mapped = sum(1 for v in cell_dept.values() if v)
    print(f"cells mapped to a department: {mapped}/{len(cids)} "
          f"(campaign {campaign})", flush=True)

    cl_ids = defaultdict(list)
    for cid, lab in zip(cids, km.labels_):
        cl_ids[int(lab)].append(cid)
    crops = cluster_crops(cl_ids, cell_dept, dept_crops, campaign)

    gen = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    shards = {}
    for cid, lab in zip(cids, km.labels_):
        k_ = int(lab)
        r2 = h3.cell_to_parent(cid, 2)
        shards.setdefault(r2, {"generated_at": gen,
                               "model_version": MODEL_VERSION,
                               "cells": {}})
        shards[r2]["cells"][cid] = {
            "cluster": k_, "label": labels[k_],
            "n_cells": len(cl_ids[k_]),
            "ar_crops": crops.get(k_, [])}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for r2, s in shards.items():
        (OUT_DIR / f"{r2}.json").write_text(
            json.dumps(s, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(shards)} analog shards "
          f"({__import__('time').monotonic() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
