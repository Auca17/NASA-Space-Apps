"""Data sanity audit for the published artifacts (task 29.3).

Checks data/processed/field/grid, data/processed/risk and
data/processed/field/analogs for impossible or suspicious values and
prints a markdown-ready report. Cross-checks 25 stratified cells against
the on-demand diagnosis when run with --live (needs DATA_BASE_URL).

Usage:
    python tools/audit_data.py [--live]
"""
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

import h3
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "back"))
from app.services.georef import province_at  # noqa: E402

GRID = ROOT / "data/processed/field/grid"
RISK = ROOT / "data/processed/risk"
ANALOGS = ROOT / "data/processed/field/analogs"

TEX_ORDER = {"Arenoso", "Franco", "Franco-arenoso", "Franco-arcilloso",
             "Franco-limoso", "Arcilloso"}
ZONES = {"pampa": (-36.0, -30.0, -64.5, -57.0),
         "andes": (-33.0, -28.0, -70.5, -68.5),
         "patagonia": (-50.0, -38.0, -72.0, -63.0),
         "nea": (-30.0, -22.0, -62.5, -55.0),
         "noa": (-28.0, -22.0, -68.5, -62.5),
         "cuyo": (-37.0, -28.5, -70.0, -66.0)}


def prov(cid):
    try:
        lat, lon = h3.cell_to_latlng(cid)
        p = province_at(lat, lon)
        return p["nam"] if p else "?"
    except Exception:
        return "?"


def ff_days(ff):
    if not ff:
        return None
    sm, sd = map(int, ff["start"].split("-"))
    em, ed = map(int, ff["end"].split("-"))
    import datetime
    a = datetime.date(2025, sm, sd).toordinal()
    b = datetime.date(2025, em, ed).toordinal()
    d = b - a
    return d + 365 if d <= 0 else d


def stats(vals):
    v = np.array([x for x in vals if x is not None], dtype=float)
    if not v.size:
        return None
    q = np.percentile(v, [0, 1, 50, 99, 100])
    return {"n": v.size, "min": q[0], "p1": q[1], "median": q[2],
            "p99": q[3], "max": q[4]}


def load_grid():
    cells = {}
    for fp in sorted(GRID.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        cells.update(d["cells"])
    return cells


def audit_grid(cells):
    fields = ["rain_mm_yr", "rain_cv", "rain_p25_mm", "heavy_days_yr",
              "hot_days_gt35", "bare_soil_days_yr", "elevation_m",
              "temp_adjust_c", "sm_anom_pct"]
    out = {"n": len(cells), "stats": {}, "flags": defaultdict(list)}
    for f in fields:
        vals = [c.get(f) for c in cells.values()]
        s = stats(vals)
        if s:
            s["null_share"] = round(1 - s["n"] / len(cells), 4)
        else:
            s = {"n": 0, "null_share": 1.0}
        out["stats"][f] = s
    out["stats"]["frost_free_days"] = stats(
        [ff_days(c.get("frost_free")) for c in cells.values()])
    out["stats"]["soc_g_kg"] = stats(
        [(c.get("soil") or {}).get("soc_g_kg") for c in cells.values()])

    F = out["flags"]
    for cid, c in cells.items():
        g = c.get
        for f in ("rain_mm_yr", "rain_p25_mm", "heavy_days_yr",
                  "hot_days_gt35", "bare_soil_days_yr"):
            if g(f) is not None and g(f) < 0:
                F["negative value"].append((cid, f, g(f)))
        ff = ff_days(g("frost_free"))
        if ff is not None and ff > 365:
            F["frost_free > 365d"].append((cid, "frost_free", ff))
        if g("hot_days_gt35") is not None and g("hot_days_gt35") > 366:
            F["hot_days > 366"].append((cid, "hot", g("hot_days_gt35")))
        if g("temp_adjust_c") is not None and abs(g("temp_adjust_c")) > 15:
            F["|temp_adjust_c| > 15"].append(
                (cid, "adj", g("temp_adjust_c")))
        if g("elevation_m") is not None and \
                not -50 <= g("elevation_m") <= 7000:
            F["elevation out of range"].append(
                (cid, "elev", g("elevation_m")))
        if g("rain_mm_yr") is not None and \
                not 20 <= g("rain_mm_yr") <= 5000:
            F["rain out of range"].append(
                (cid, "rain", g("rain_mm_yr")))
        if g("bare_soil_days_yr") is not None and \
                g("bare_soil_days_yr") > 366:
            F["bare_soil > 366d"].append(
                (cid, "bare", g("bare_soil_days_yr")))
        if g("lc") == "crop" and g("bare_soil_days_yr") == 0:
            F["crop with zero bare days"].append((cid, "bare", 0))
        tex = (g("soil") or {}).get("texture")
        if tex is not None and tex not in TEX_ORDER:
            F["unknown soil texture"].append((cid, "tex", tex))
    return out


def audit_risk():
    files = sorted(RISK.glob("*.json"))
    cells = {}
    gen = None
    for fp in files:
        d = json.loads(fp.read_text(encoding="utf-8"))
        gen = gen or d.get("generated_at")
        cells.update(d["cells"])
    cats = Counter(c["cat"] for c in cells.values())
    by_prov = defaultdict(Counter)
    for cid, c in cells.items():
        by_prov[prov(cid)][c["cat"]] += 1
    flags = defaultdict(list)
    for cid, c in cells.items():
        if c.get("p") is not None and c["p"] > 0.8:
            flags["p > 0.8"].append((cid, "p", c["p"]))
        r = c.get("ratio")
        if r is not None and (r < 0 or r != r):
            flags["ratio < 0 or NaN"].append((cid, "ratio", r))
        if c.get("clim") is not None and c["clim"] > 1:
            flags["clim > 1"].append((cid, "clim", c["clim"]))
        rs = c.get("reasons") or []
        if not rs:
            flags["empty reasons"].append((cid, "reasons", rs))
        elif any("{" in x or "TODO" in x or "placeholder" in x.lower()
                 for x in rs):
            flags["template reasons"].append((cid, "reasons", rs))
    return {"n": len(cells), "generated_at": gen, "cats": dict(cats),
            "by_prov": {k: dict(v) for k, v in by_prov.items()},
            "p": stats([c.get("p") for c in cells.values()]),
            "ratio": stats([c.get("ratio") for c in cells.values()]),
            "flags": flags}


def audit_analogs():
    files = sorted(ANALOGS.glob("*.json"))
    cells = {}
    for fp in files:
        cells.update(json.loads(fp.read_text(encoding="utf-8"))["cells"])
    sizes = Counter(c["cluster"] for c in cells.values())
    flags = defaultdict(list)
    for cid, c in cells.items():
        if not (c.get("label") or "").strip():
            flags["empty label"].append((cid, "label", c.get("label")))
        for cr in c.get("ar_crops") or []:
            if cr.get("share") is not None and cr["share"] > 1:
                flags["share > 1"].append((cid, "share", cr["share"]))
            if (cr.get("yield_kg_ha") is not None
                    and cr["yield_kg_ha"] < 0):
                flags["negative yield"].append(
                    (cid, "yield", cr["yield_kg_ha"]))
    return {"n": len(cells), "clusters": len(sizes),
            "sizes": dict(sorted(sizes.items())), "flags": flags}


def cross_check(cells, n=25):
    """25 stratified cells vs the on-demand diagnosis (--live)."""
    import asyncio
    import httpx
    sys.path.insert(0, str(ROOT / "back"))
    from app.main import app

    by_zone = defaultdict(list)
    for cid in cells:
        lat, lon = h3.cell_to_latlng(cid)
        for z, (s, nn, w, e) in ZONES.items():
            if s <= lat <= nn and w <= lon <= e:
                by_zone[z].append((cid, lat, lon))
    random.seed(29)
    sample = []
    per = max(1, n // len(by_zone))
    for z, arr in sorted(by_zone.items()):
        sample.extend((z, *t) for t in random.sample(
            arr, min(per, len(arr))))
    sample = sample[:n]

    async def diag(c, lat, lon):
        d = 0.004
        poly = {"type": "Polygon", "coordinates": [[
            [lon - d, lat - d], [lon + d, lat - d],
            [lon + d, lat + d], [lon - d, lat + d],
            [lon - d, lat - d]]]}
        async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://t", timeout=30) as cl:
            r = await cl.post("/api/field/diagnose",
                              json={"polygon": poly, "crop": "soja"})
            return r.json()

    rows = []
    for z, cid, lat, lon in sample:
        try:
            d = asyncio.run(diag(cid, lat, lon))
        except Exception as exc:
            rows.append({"zone": z, "cell": cid, "error":
                         type(exc).__name__})
            continue
        cm = {cd["id"]: cd for cd in d.get("cards", [])}
        gc = cells[cid]
        row = {"zone": z, "cell": cid, "province": prov(cid),
               "degraded": d.get("degraded", False)}
        for fid, ckey in (("rain", "rain_mm_yr"),
                          ("heat", "hot_days_gt35")):
            card = cm.get(fid) or {}
            row[f"{fid}_grid"] = gc.get(ckey)
            row[f"{fid}_diag"] = card.get("value")
            row[f"{fid}_src"] = card.get("source")
        ffc = cm.get("frost") or {}
        row["frost_grid_days"] = ff_days(gc.get("frost_free"))
        row["frost_diag_days"] = ffc.get("value")
        rows.append(row)
    return rows


def pct_diff(a, b):
    if a is None or b is None:
        return None
    return abs(a - b) / max(abs(b), 1e-9) * 100


def worst(items, n=5):
    return sorted(items, key=lambda x: -abs(x[2])
                  if isinstance(x[2], (int, float)) else 0)[:n]


def main():
    live = "--live" in sys.argv
    cells = load_grid()
    g = audit_grid(cells)
    rk = audit_risk()
    an = audit_analogs()

    print(f"# Data audit — {g['n']} grid cells, {rk['n']} risk cells, "
          f"{an['n']} analog cells\n")
    print("## field/grid — field stats\n")
    print("| field | n | min | p1 | median | p99 | max | null% |")
    print("|---|---|---|---|---|---|---|---|")
    for f, s in g["stats"].items():
        if not s or s["n"] == 0:
            print(f"| {f} | 0 | — | — | — | — | — | 100 |")
            continue
        ns = s.get("null_share", 1 - s["n"] / g["n"])
        print(f"| {f} | {s['n']} | {s['min']:.3g} | {s['p1']:.3g} | "
              f"{s['median']:.3g} | {s['p99']:.3g} | {s['max']:.3g} | "
              f"{ns * 100:.1f} |")
    print("\n## field/grid — flags\n")
    if not g["flags"]:
        print("(none)")
    for k, items in sorted(g["flags"].items()):
        print(f"### {k}: {len(items)}\n")
        for cid, f, v in worst(items):
            print(f"- `{cid}` ({prov(cid)}): {f} = {v}")
        print()
    print("## risk\n")
    print(f"- generated_at: {rk['generated_at']}")
    print(f"- categories: {rk['cats']}")
    print(f"- p: {rk['p']}")
    print(f"- ratio: {rk['ratio']}")
    print("- by province:")
    for p, c in sorted(rk["by_prov"].items()):
        print(f"  - {p}: {c}")
    for k, items in sorted(rk["flags"].items()):
        print(f"### {k}: {len(items)}")
        for cid, f, v in worst(items):
            print(f"- `{cid}` ({prov(cid)}): {f} = {v}")
    print("\n## field/analogs\n")
    print(f"- cells: {an['n']}, clusters: {an['clusters']}")
    print(f"- cluster sizes: {an['sizes']}")
    for k, items in sorted(an["flags"].items()):
        print(f"### {k}: {len(items)}")
        for cid, f, v in worst(items):
            print(f"- `{cid}` ({prov(cid)}): {f} = {v}")
    if not an["flags"]:
        print("- flags: none")

    if live:
        print("\n## cross-check vs on-demand diagnosis\n")
        rows = cross_check(cells)
        bad = []
        for r in rows:
            if "error" in r:
                print(f"- `{r['cell']}` {r['zone']}: ERROR {r['error']}")
                continue
            notes = []
            for k in ("rain", "heat"):
                pd_ = pct_diff(r[f"{k}_diag"], r[f"{k}_grid"])
                if pd_ is not None and pd_ > 20:
                    notes.append(f"{k}: grid {r[f'{k}_grid']} vs diag "
                                 f"{r[f'{k}_diag']} ({pd_:.0f}%, "
                                 f"{r[f'{k}_src']})")
            fd = pct_diff(r["frost_diag_days"], r["frost_grid_days"])
            if fd is not None and fd > 20:
                notes.append(
                    f"frost: grid {r['frost_grid_days']}d vs diag "
                    f"{r['frost_diag_days']}d ({fd:.0f}%)")
            line = (f"- `{r['cell']}` {r['zone']}/{r['province']}: "
                    f"rain {r['rain_grid']}->{r['rain_diag']}, "
                    f"heat {r['heat_grid']}->{r['heat_diag']}, "
                    f"frost {r['frost_grid_days']}->{r['frost_diag_days']}"
                    + (" [degraded]" if r["degraded"] else ""))
            print(line)
            if notes:
                bad.append((r, notes))
                for nt in notes:
                    print(f"    ! {nt}")
        print(f"\ncells checked: {len(rows)}, disagreements >20%: "
              f"{len(bad)}")


if __name__ == "__main__":
    main()
