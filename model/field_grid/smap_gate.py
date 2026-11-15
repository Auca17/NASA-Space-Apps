"""Gate: sm_anom_pct vs POWER 30-day rain departure, ~40 cells."""
import json, random, sys
from pathlib import Path
import numpy as np, h3, httpx
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
GRID = ROOT / "data/processed/field/grid"
random.seed(7)

cells = {}
for fp in GRID.glob("*.json"):
    d = json.loads(fp.read_text(encoding="utf-8"))
    for cid, c in d["cells"].items():
        if c.get("sm_anom_z") is not None:
            cells[cid] = c["sm_anom_z"]
print("cells with sm_anom:", len(cells))
sample = random.sample(sorted(cells), min(40, len(cells)))

# same calendar window the SMAP pipeline used
import pandas as pd
latest = pd.Timestamp("2026-11-10")          # from mat columns
recent = (latest - pd.Timedelta(days=29), latest)
years = list(range(2015, 2026))
def win(y):  # baseline: same doy window each year
    e = latest - pd.DateOffset(years=latest.year - y)
    return (e - pd.Timedelta(days=29), e)

def rain_dep(cid):
    lat, lon = h3.cell_to_latlng(cid)
    r = httpx.get("https://power.larc.nasa.gov/api/temporal/daily/point",
        params={"parameters": "PRECTOTCORR", "community": "AG",
                "latitude": round(lat, 4), "longitude": round(lon, 4),
                "start": "20150914", "end": "20261110",
                "format": "JSON"}, timeout=60)
    r.raise_for_status()
    p = r.json()["properties"]["parameter"]["PRECTOTCORR"]
    s = pd.Series({pd.Timestamp(f"{k[:4]}-{k[4:6]}-{k[6:]}"): v
                   for k, v in p.items() if v > -900})
    rm = s.loc[recent[0]:recent[1]].mean()
    bm = np.mean([s.loc[win(y)[0]:win(y)[1]].mean() for y in years])
    return rm - bm  # absolute mm/day departure

with ThreadPoolExecutor(max_workers=8) as ex:
    deps = list(ex.map(rain_dep, sample))
sm = np.array([cells[c] for c in sample]); rp = np.array(deps)
ok = ~(np.isnan(sm) | np.isnan(rp)); sm, rp = sm[ok], rp[ok]
from scipy.stats import spearmanr, pearsonr
print(f"n={len(sm)}  sm mean={sm.mean():.1f}  rain-dep mean={rp.mean():.1f}")
print("pearson r=%.3f  spearman rho=%.3f" % (pearsonr(sm, rp)[0], spearmanr(sm, rp)[0]))
