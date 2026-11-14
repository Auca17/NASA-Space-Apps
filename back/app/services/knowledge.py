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
    gdd_base10: int = 0
    frost_tolerance: str = "medium"
    drought_tolerance: str = "medium"
    heat_tolerance: str = "medium"
    water_mm_cycle: int
    root_depth_cm: int = 100
    n_fixation: bool = False
    residue_t_ha: float = 0.0
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
    sources: list[str] = Field(min_length=1)


class Knowledge(BaseModel):
    crops: dict[str, Crop]
    rotations: list[Rotation]


def load(path: Path | None = None) -> Knowledge:
    path = path or KNOWLEDGE_DIR
    try:
        crops_raw = json.loads((path / "crops.json").read_text(
            encoding="utf-8"))["crops"]
        rots_raw = json.loads((path / "rotations.json").read_text(
            encoding="utf-8"))["rotations"]
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
    return Knowledge(crops=crops, rotations=rots)


KNOWLEDGE = load()


class MeasureReq(BaseModel):
    people: int = 0
    machinery: list[str] = []
    downtime_h: float = 0
    cost: str = "low"


class Measure(BaseModel):
    id: str
    name: dict
    factor: str
    addresses: str
    benefit: str
    requires: MeasureReq = MeasureReq()
    triggers: list[str]
    sources: list[str] = Field(min_length=1)


def load_measures(path: Path | None = None) -> list[Measure]:
    path = path or KNOWLEDGE_DIR
    try:
        raw = json.loads((path / "measures.json").read_text(
            encoding="utf-8"))["measures"]
    except Exception as exc:
        raise KnowledgeError(f"measures load failed: {exc}") from exc
    return [Measure(**m) for m in raw]


MEASURES = load_measures()
