"""GDD per crop + host-aware pest_break (task 44 §1-2)."""
import datetime as dt

from app.routers.field import gdd_per_year
from app.services.knowledge import KNOWLEDGE
from app.services.rotations import (Rotation, SeqItem, host_sharing_pairs,
                                    indicators)


def _const(years, tmax, tmin):
    """Constant daily series over `years` full years."""
    mx, mn = {}, {}
    d = dt.date(2021, 1, 1)
    while d < dt.date(2021 + years, 1, 1):
        mx[d], mn[d] = tmax, tmin
        d += dt.timedelta(days=1)
    return mx, mn


def test_gdd_per_year_basic():
    # constant 28/16 -> (28+16)/2 - 10 = 12/day -> ~4380/yr
    mx, mn = _const(3, 28.0, 16.0)
    v = gdd_per_year(mx, mn)
    assert v is not None and v > 4000


def test_gdd_cold_days_floor_at_zero():
    # every day below base: (8+10)/2 - 10 < 0 -> 0 contribution
    mx, mn = _const(3, 8.0, 0.0)
    assert gdd_per_year(mx, mn) == 0


def test_gdd_tmax_capped_at_30():
    # tmax 40: capped to 30 -> (30+10)/2 - 10 = 10/day -> 3650
    mx, mn = _const(3, 40.0, 10.0)
    assert gdd_per_year(mx, mn) == 3650


def test_gdd_requires_full_year():
    only_60 = {dt.date(2021, 1, 1) + dt.timedelta(days=i): 20.0
               for i in range(60)}
    assert gdd_per_year(only_60, only_60) is None


def test_catalog_gdd_values():
    for cid, c in KNOWLEDGE.crops.items():
        if cid in ("alfalfa", "monte_nativo"):
            assert c.gdd_base10 is None, cid
        else:
            assert isinstance(c.gdd_base10, int) and \
                800 <= c.gdd_base10 <= 2500, cid


def _rot(crops):
    return Rotation(id="t", name={"es": "t"}, years=1,
                    sequence=[SeqItem(crop=c, start="01-06",
                                      end="01-12", cover=True)
                              for c in crops],
                    sources=["test"])


def test_host_pairs_maize_maize():
    # two items -> fwd pair + wrap pair, both maiz->maiz
    pairs = host_sharing_pairs(_rot(["maiz", "maiz"]))
    assert len(pairs) == 2
    names = [p.id for p in pairs[0][2]]
    assert "chicharrita_spiroplasma" in names
    assert "fusarium" in names


def test_host_pairs_soja_maiz_shares_nematodes():
    pairs = host_sharing_pairs(_rot(["soja", "maiz"]))
    assert len(pairs) == 2  # fwd + wrap
    ids = {p.id for pair in pairs for p in pair[2]}
    assert "nematodos" in ids and "diaporthe" not in ids


def test_host_pairs_none_for_unrelated():
    # vid and mani share no cataloged pest host
    assert host_sharing_pairs(_rot(["vid", "mani"])) == []


def test_pest_break_counts_pairs_not_families():
    mono = _rot(["maiz", "maiz"])
    ind = indicators(mono, {"cards": [], "calendar": {"rows": []}},
                     "pampa_humeda")
    assert ind["pest_break"] == 2   # fwd + wrap host-sharing pairs
    assert ind["families"] == 1     # botanical diversity stays secondary


def test_risks_name_the_shared_pests():
    from app.services.rotations import _risks
    rot = _rot(["maiz", "maiz"])
    risks = _risks(rot, True, [])
    joined = " ".join(risks)
    assert "Maíz seguido de Maíz mantiene" in joined
    assert "Fusarium" in joined or "Chicharrita" in joined
