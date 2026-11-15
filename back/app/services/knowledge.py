"""Knowledge loader: crops.json + rotations.json (contract section 3).

Loaded and validated at import time — a rotation referencing an unknown
crop, or a crop/rotation without `sources`, fails loudly at startup.
"""

import json
import re
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"
ZONES = {"pampa_humeda", "nea", "noa", "cuyo", "patagonia"}
MM_DD = re.compile(r"^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$")
LEVEL = {"low": 1, "medium": 2, "high": 3}


class KnowledgeError(RuntimeError):
    pass


class Crop(BaseModel):
    id: str
    name: dict
    family: str
    sowing: dict[str, list[str]] = {}
    harvest: dict[str, list[str]] = {}
    cycle_end: dict[str, str] = {}  # MM-DD of physiological maturity
    gdd_base10: int | None = 0  # contract 1: null = no sourced value
    gdd_base_c: int | None = None
    gdd_flowering_to_maturity: list[int] | None = None
    frost_tolerance: str = "medium"
    drought_tolerance: str = "medium"
    heat_tolerance: str = "medium"
    color: str | None = None
    icon: str | None = None
    rotatable: bool = True  # False: perennials/nativo never in sequences
    frost_window: dict[str, list[str]] = {}  # zone -> [MM-DD, MM-DD]
    water_mm_cycle: int
    water_mm_observed: float | None = None
    water_observed_note: str | None = None
    root_depth_cm: int | None = 100
    n_fixation: bool = False
    residue_t_ha: float = 0.0
    residue_note: str | None = None
    root_carbon_note: str | None = None
    forage: bool = False
    market_ar: str = "medium"
    sources: list[str] = Field(min_length=1)

    @field_validator("sowing", "harvest")
    @classmethod
    def _windows(cls, v):
        for z, win in v.items():
            if z not in ZONES:
                raise ValueError(f"unknown zone {z}")
            if len(win) != 2 or not all(MM_DD.match(d) for d in win):
                raise ValueError(f"bad {z} window {win}")
        return v

    @field_validator("cycle_end")
    @classmethod
    def _cycle_end(cls, v):
        for z, d in v.items():
            if z not in ZONES:
                raise ValueError(f"unknown zone {z}")
            if not MM_DD.match(d):
                raise ValueError(f"bad {z} cycle_end {d}")
        return v

    @field_validator("frost_window")
    @classmethod
    def _frost_window(cls, v):
        for z, win in v.items():
            if z not in ZONES:
                raise ValueError(f"unknown zone {z}")
            if len(win) != 2 or not all(MM_DD.match(d) for d in win):
                raise ValueError(f"bad {z} frost_window {win}")
        return v

    def window(self, zone: str | None):
        """(sowing_start, sowing_end, harvest_end) for a zone, or None."""
        s = self.sowing.get(zone or "") or (
            next(iter(self.sowing.values())) if zone in (None, "other")
            else None)
        h = self.harvest.get(zone or "") or (
            next(iter(self.harvest.values())) if zone in (None, "other")
            else None)
        if not s or not h:
            return None
        return s[0], s[1], h[1]

    def cycle_end_for(self, zone: str | None) -> str | None:
        """MM-DD of physiological maturity for the zone, when sourced.

        The frost check and the water window end here; `harvest` stays
        the real harvest window (calendar, bare soil, dry-season
        harvest triggers).
        """
        return self.cycle_end.get(zone or "") or (
            next(iter(self.cycle_end.values()))
            if zone in (None, "other") and self.cycle_end else None)


class SeqItem(BaseModel):
    crop: str
    start: str
    end: str
    cover: bool = True

    @field_validator("start", "end")
    @classmethod
    def _md(cls, v):
        if not MM_DD.match(v):
            raise ValueError(f"bad MM-DD {v}")
        return v


class Rotation(BaseModel):
    id: str
    name: dict
    years: int = 1
    sequence: list[SeqItem]
    bare_soil_days: int | None = None
    zones: list[str] = []        # zones where the rotation is valid (3.2)
    typical_for: list[str] = []  # zones where it is the default current one
    sources: list[str] = Field(min_length=1)

    @field_validator("zones", "typical_for")
    @classmethod
    def _zone_ids(cls, v):
        for z in v:
            if z not in ZONES:
                raise ValueError(f"unknown zone {z}")
        return v


class ZoneReference(BaseModel):
    """Documented rotation reference for a zone with no computed one."""
    zone: str
    text: str
    source: str

    @field_validator("zone")
    @classmethod
    def _zone(cls, v):
        if v not in ZONES:
            raise ValueError(f"unknown zone {v}")
        return v


class Knowledge(BaseModel):
    crops: dict[str, Crop]
    rotations: list[Rotation]
    zone_references: list[ZoneReference] = []


def load(path: Path | None = None) -> Knowledge:
    path = path or KNOWLEDGE_DIR
    try:
        crops_raw = json.loads((path / "crops.json").read_text(
            encoding="utf-8"))["crops"]
        rots_doc = json.loads((path / "rotations.json").read_text(
            encoding="utf-8"))
        rots_raw = rots_doc["rotations"]
        refs = [ZoneReference(**r)
                for r in rots_doc.get("zone_references", [])]
    except Exception as exc:
        raise KnowledgeError(f"knowledge load failed: {exc}") from exc
    crops = {}
    for c in crops_raw:
        try:
            crops[c["id"]] = Crop(**c)
        except Exception as exc:
            raise KnowledgeError(f"crop '{c.get('id')}' invalid: {exc}")
    rots = []
    for r in rots_raw:
        try:
            rot = Rotation(**r)
        except Exception as exc:
            raise KnowledgeError(f"rotation '{r.get('id')}' invalid: {exc}")
        for s in rot.sequence:
            if s.crop not in crops:
                raise KnowledgeError(
                    f"rotation '{rot.id}' references unknown crop "
                    f"'{s.crop}'")
        rots.append(rot)
    return Knowledge(crops=crops, rotations=rots, zone_references=refs)


KNOWLEDGE = load()


class MeasureReq(BaseModel):
    people: int | None = 0
    machinery: list[str] = []
    downtime_h: float | None = 0
    cost: str = "low"
    reference_width_m: float | None = None
    reference_width_note: str | None = None


class Measure(BaseModel):
    id: str
    name: dict
    factor: str
    addresses: str
    benefit: str
    requires: MeasureReq = MeasureReq()
    checks: list[str] = []
    triggers: list[str]
    sources: list[str] = Field(min_length=1)


class StopThresholds(BaseModel):
    """Harvest stop thresholds for one zone — the sources disagree by
    region, so they are regional and explicit."""
    wind_gt_kmh: float
    temp_gt_c: float
    rh_lt_pct: float
    guide: str
    rh_unconfirmed: bool = False
    source: str


class Case(BaseModel):
    """A real incident shown next to the prevention measures (kind
    news_report = periodístico, not a worker testimony)."""
    id: str
    place: str
    date: str
    summary: str
    unknown: str | None = None
    source: dict
    lessons: list[str] = []
    kind: str = "news_report"


def load_measures(path: Path | None = None) -> list[Measure]:
    path = path or KNOWLEDGE_DIR
    try:
        raw = json.loads((path / "measures.json").read_text(
            encoding="utf-8"))["measures"]
    except Exception as exc:
        raise KnowledgeError(f"measures load failed: {exc}") from exc
    return [Measure(**m) for m in raw]


def load_stop_thresholds(path: Path | None = None
                         ) -> dict[str, StopThresholds]:
    path = path or KNOWLEDGE_DIR
    try:
        raw = json.loads((path / "measures.json").read_text(
            encoding="utf-8")).get("stop_thresholds") or {}
    except Exception as exc:
        raise KnowledgeError(f"measures load failed: {exc}") from exc
    out = {z: StopThresholds(**v) for z, v in raw.items()}
    for z in out:
        if z != "default" and z not in ZONES:
            raise KnowledgeError(f"stop_thresholds: unknown zone {z}")
    return out


def load_cases(path: Path | None = None) -> list[Case]:
    path = path or KNOWLEDGE_DIR
    try:
        raw = json.loads((path / "cases.json").read_text(
            encoding="utf-8"))["cases"]
    except FileNotFoundError:
        return []
    except Exception as exc:
        raise KnowledgeError(f"cases load failed: {exc}") from exc
    return [Case(**c) for c in raw]


def stop_thresholds_for(zone: str | None) -> StopThresholds | None:
    return STOP_THRESHOLDS.get(zone or "default") or \
        STOP_THRESHOLDS.get("default")


MEASURES = load_measures()
STOP_THRESHOLDS = load_stop_thresholds()
CASES = load_cases()
