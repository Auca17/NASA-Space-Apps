"""INTA SIGA vs IMERG/POWER monthly rainfall validation (Field Shift F10).

Downloads daily rain for INTA SIGA automatic stations -- all Mendoza
automatics plus a ~20-station Pampas sample (Buenos Aires, La Pampa,
Cordoba, Santa Fe) -- 2015..last full year, aggregates to monthly mm,
pairs each station with its nearest IMERG 0.1-deg pixel (from the
shared imerg_ar_months.npz cache) and its nearest NASA POWER cell
(from power_ar_daily.parquet), and writes:

  docs/validation/rain-siga/pairs.csv       station x month x product
  docs/validation/rain-siga/validation.json Orin-shaped metrics
  (README.md documents method/terms/limits)

Source: SIGA -- Sistema de Informacion de Agroclima, INTA
(https://siga.inta.gob.ar). Terms: cite INTA SIGA as data source; the
portal is public and unauthenticated -- we fetch at most ~1 request/s
and cache XLS files under data/siga/ (git-ignored, refetchable).

Nothing here uploads to R2. Outputs are local validation artifacts.
"""
import calendar
import json
import math
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SIGA_META = ("https://siga.inta.gob.ar/5WP5HPJSeLmID3Wy.php"
             "?param_type=estacionautomatica&param_value=")
SIGA_XLS = "https://siga.inta.gob.ar/document/series/{sid}.xls"
UA = {"User-Agent": "field-shift-validation/1.0 (INTA SIGA, rainfall "
                    "ground-truth check)"}
CACHE_DIR = ROOT / "data/siga"
IMERG_NPZ = ROOT / "data/earthdata/imerg_ar_months.npz"
POWER_PARQ = ROOT / "data/processed/model_input/power_ar_daily.parquet"
OUT_DIR = ROOT / "docs/validation/rain-siga"
IMERG_BBOX = (-74.0, -56.5, -55.0, -21.0)  # lon_w, lon_e, lat_s, lat_n
Y0 = 2015
Y1 = 2024          # last full year covered by the IMERG cache
MIN_DAYS = 25      # a month needs >=25 days of station data to count
PAMPAS_PROV = {"Buenos Aires", "La Pampa", "Córdoba", "Santa Fe"}
PAMPAS_SAMPLE = 20


def fetch_json(url: str) -> list:
    req = urllib.request.Request(url, headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def download_xls(sid: str) -> Path:
    """Cached XLS download; retries on transient HTTP errors."""
    path = CACHE_DIR / f"{sid}.xls"
    if path.exists() and path.stat().st_size > 10_000:
        return path
    CACHE_DIR.mkdir(exist_ok=True)
    last_exc = None
    for att in range(3):
        try:
            req = urllib.request.Request(SIGA_XLS.format(sid=sid),
                                         headers=UA)
            data = urllib.request.urlopen(req, timeout=90).read()
            path.write_bytes(data)
            time.sleep(1.0)  # be polite to the SIGA portal
            return path
        except Exception as exc:  # noqa: BLE001 - report and retry
            last_exc = exc
            time.sleep(3 + att * 5)
    print(f"  {sid}: download failed: {last_exc}")
    return None


def station_monthly_rain(path: Path) -> pd.Series:
    """Daily `Precipitacion_Pluviometrica` -> monthly sums (mm)."""
    df = pd.read_excel(path, sheet_name=0, engine="xlrd")
    col = next((c for c in df.columns
                if "Precipitacion_Pluviometrica" in c), None)
    if col is None:
        return pd.Series(dtype=float)
    s = pd.Series(pd.to_numeric(df[col], errors="coerce").values,
                  index=pd.to_datetime(df["Fecha"], errors="coerce"))
    s = s[~s.index.isna()].sort_index()
    s = s["2015":f"{Y1}"]
    g = s.groupby([s.index.year, s.index.month])
    tot, cnt = g.sum(min_count=1), g.count()
    days = pd.Series(
        [calendar.monthrange(y, m)[1] for y, m in tot.index],
        index=tot.index)
    keep = (cnt >= MIN_DAYS) & (cnt >= days * 0.8)
    monthly = tot[keep]
    monthly.index = [f"{y}-{m:02d}" for y, m in monthly.index]
    return monthly


def imerg_axes(shape):
    """Same center-grid derivation as update_imerg.grid_axes."""
    flat = -89.95 + np.arange(1800) * 0.1
    flon = -179.95 + np.arange(3600) * 0.1
    _, lone, lats, _ = IMERG_BBOX
    lonw = IMERG_BBOX[0]
    iy = np.where((flat >= lats) & (flat <= IMERG_BBOX[3]))[0]
    ix = np.where((flon >= lonw) & (flon <= lone))[0]
    return flat[iy], flon[ix]


def nearest(arr: np.ndarray, v: float) -> int:
    return int(np.argmin(np.abs(arr - v)))


def metrics(pairs: pd.DataFrame, col: str) -> dict:
    """Monthly bias (product - station), RMSE, Pearson r."""
    d = pairs.dropna(subset=[col, "station_mm"])
    n = len(d)
    if n < 5:
        return {"n": n, "bias": None, "rmse": None, "r": None}
    diff = d[col] - d["station_mm"]
    r = (d[col].corr(d["station_mm"])
         if d[col].std() > 0 and d["station_mm"].std() > 0 else None)
    return {"n": n, "bias": round(float(diff.mean()), 2),
            "rmse": round(float(np.sqrt((diff ** 2).mean())), 2),
            "r": None if r is None or math.isnan(r)
                 else round(float(r), 3)}


def quality(var: dict) -> str:
    if var["r"] is None:
        return "insufficient"
    if var["r"] >= 0.7 and abs(var["bias"] or 0) <= 20:
        return "good"
    if var["r"] >= 0.5:
        return "fair"
    return "poor"


def pick_pampas(stations: list[dict]) -> list[dict]:
    """~PAMPAS_SAMPLE automatic stations spread over the Pampas
    provinces: all La Pampa and Cordoba stations, then the most
    spatially spread Buenos Aires / Santa Fe ones."""
    cand = [s for s in stations
            if s.get("provincia") in PAMPAS_PROV
            and s.get("latitud") and s.get("longitud")
            and not s["nombre"].startswith(" ")]
    core = [s for s in cand
            if s["provincia"] in ("La Pampa", "Córdoba")]
    rest = [s for s in cand
            if s["provincia"] in ("Buenos Aires", "Santa Fe")]
    rest.sort(key=lambda s: (s["provincia"], s["latitud"]))
    # stride-sample BA/SF for spatial spread
    need = max(0, PAMPAS_SAMPLE - len(core))
    step = max(1, len(rest) // max(1, need))
    return core + rest[::step][:need]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stations = fetch_json(SIGA_META)
    mendoza = [s for s in stations if s.get("provincia") == "Mendoza"
               and s.get("latitud")]
    pampas = pick_pampas(stations)
    sel = [("mendoza", s) for s in mendoza] + \
          [("pampas", s) for s in pampas]
    print(f"selected: {len(mendoza)} Mendoza + {len(pampas)} Pampas")

    imerg = dict(np.load(IMERG_NPZ))
    lats, lons = imerg_axes(next(iter(imerg.values())).shape)
    power = pd.read_parquet(
        POWER_PARQ, columns=["lat", "lon", "date", "PRECTOTCORR"])
    pdate = pd.to_datetime(power["date"])
    power["month"] = pdate.dt.strftime("%Y-%m")
    power = power[(pdate >= f"{Y0}-01-01")
                  & (pdate < f"{Y1 + 1}-01-01")]
    cells = power[["lat", "lon"]].drop_duplicates()
    pmonth = power.groupby(["lat", "lon", "month"])[
        "PRECTOTCORR"].sum().reset_index()

    rows = []
    for group, st in sel:
        sid, name = st["idInterno"], st["nombre"].strip()
        lat, lon = float(st["latitud"]), float(st["longitud"])
        path = download_xls(sid)
        if path is None:
            continue
        monthly = station_monthly_rain(path)
        if monthly.empty:
            print(f"  {sid} {name}: no usable daily rain")
            continue
        iy, ix = nearest(lats, lat), nearest(lons, lon)
        c = cells.iloc[((cells.lat - lat) ** 2
                        + (cells.lon - lon) ** 2).values.argmin()]
        pcell = pmonth[(pmonth.lat == c.lat)
                       & (pmonth.lon == c.lon)]
        pmap = dict(zip(pcell.month, pcell.PRECTOTCORR))
        for ym, mm in monthly.items():
            if int(ym[:4]) > Y1:
                continue
            rows.append({
                "station_id": sid, "station": name,
                "region": group, "province": st["provincia"],
                "st_lat": lat, "st_lon": lon,
                "month": ym, "station_mm": round(float(mm), 1),
                "imerg_mm": (None if ym not in imerg else round(
                    float(imerg[ym][iy, ix]), 1)),
                "imerg_lat": round(float(lats[iy]), 2),
                "imerg_lon": round(float(lons[ix]), 2),
                "power_mm": (None if ym not in pmap else round(
                    float(pmap[ym]), 1)),
                "power_lat": float(c.lat), "power_lon": float(c.lon)})
        print(f"  {sid} {name}: {len(monthly)} months "
              f"(imerg {lats[iy]:.2f},{lons[ix]:.2f}; "
              f"power {c.lat:.2f},{c.lon:.2f})")

    pairs = pd.DataFrame(rows)
    pairs.to_csv(OUT_DIR / "pairs.csv", index=False)
    nst = pairs.station_id.nunique()
    period = f"{pairs.month.min()} a {pairs.month.max()}"

    variables = []
    for vid, col, label in (
            ("rain_imerg", "imerg_mm", "GPM IMERG monthly V07"),
            ("rain_power", "power_mm", "NASA POWER PRECTOTCORR")):
        m = metrics(pairs, col)
        per_st = [{"station_id": s, "station": g.station.iloc[0],
                   "region": g.region.iloc[0],
                   **metrics(g, col)}
                  for s, g in pairs.groupby("station_id")]
        var = {"id": vid,
               "satellite": {"dataset": label,
                             "resolution": ("0.1° mensual" if vid ==
                                            "rain_imerg"
                                            else "0.5°×0.625° diario "
                                                 "→ mensual"),
                             "period": period},
               "field": {"source": "INTA SIGA estaciones automáticas",
                         "n_sites": nst},
               "unit": "mm/mes", "reference_kind": "field",
               "n": m["n"], "rmse": m["rmse"], "bias": m["bias"],
               "r": m["r"], "per_station": per_st}
        var["quality"] = quality(var)
        variables.append(var)

    out = {"version": "v1", "synthetic": False,
           "generated_at": pd.Timestamp.now("UTC")
           .strftime("%Y-%m-%dT%H:%M:%SZ"),
           "source": (f"INTA SIGA estaciones automáticas ({nst} "
                      f"estaciones), {period}"),
           "variables": variables}
    (OUT_DIR / "validation.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for v in variables:
        print(v["id"], {k: v[k] for k in ("n", "bias", "rmse", "r")})


if __name__ == "__main__":
    main()
