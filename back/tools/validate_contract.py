"""Contract validator — task 05 step 5.

    python back/tools/validate_contract.py <dir-or-url>

Validates every contract file it finds: static files (contract section 2)
and endpoint responses (section 4) by path pattern; knowledge files by
their pydantic models. Prints one line per file: `ok <path>` or
`FAIL <path>: <first error>`. Exit code 1 if anything fails.

For a base URL it validates `meta.json` and any explicit extra paths given
as further arguments (plain R2/public buckets cannot be listed).
"""

import gzip
import json
import re
import sys
import urllib.request
from pathlib import Path

import jsonschema

H3 = r"8[0-9a-f]{14}"
MONTH = r"\d{4}-\d{2}"
MD = r"^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$"

STR = {"type": "string"}
NUM = {"type": ["number", "null"]}
CARD = {
    "type": "object",
    "required": ["id", "value", "unit", "text", "source", "resolution",
                 "confidence"],
    "properties": {
        "id": STR, "value": {}, "unit": {"type": ["string", "null"]},
        "text": STR, "source": STR, "resolution": STR,
        "confidence": {"enum": ["high", "medium", "low"]}}}
CAL_ROW = {"type": "object", "required": ["id", "label", "levels"],
           "properties": {"id": STR, "label": STR,
                          "levels": {"type": "array", "minItems": 12,
                                     "maxItems": 12,
                                     "items": {"type": ["integer", "null"]}}}}
MEASURE = {
    "type": "object",
    "required": ["id", "name", "factor", "why", "benefit", "requires",
                 "cost", "source"],
    "properties": {
        "id": STR, "name": STR, "factor": STR, "why": STR,
        "benefit": STR, "requires": {"type": "object"}, "cost": STR,
        "source": STR}}

SCHEMAS = [
    (re.compile(r"^meta\.json$"), {
        "type": "object",
        "required": ["version", "generated_at", "units", "range",
                     "baseline", "h3", "harmonization",
                     "low_confidence_periods", "sp_until", "semaphore"],
        "properties": {"version": STR, "generated_at": STR}}),
    (re.compile(rf"^globe/{MONTH}\.json$"), {
        "type": "object", "required": ["month", "cells"],
        "properties": {
            "month": {"type": "string", "pattern": f"^{MONTH}$"},
            "cells": {"type": "array",
                      "items": {"type": "array", "minItems": 2,
                                "maxItems": 2,
                                "prefixItems": [
                                    {"type": "string",
                                     "pattern": f"^{H3}$"},
                                    {"type": "number"}],
                                "items": False}}}}),
    (re.compile(rf"^fire/cal/{H3}\.json$"), {
        "type": "object", "required": ["shard", "months", "cells"],
        "properties": {
            "shard": STR,
            "months": {"type": "array", "items": STR, "minItems": 1},
            "cells": {"type": "object", "additionalProperties": {
                "type": "object", "required": ["m", "clim"],
                "properties": {
                    "m": {"type": "array", "items": NUM},
                    "clim": {"type": "array", "minItems": 52,
                             "maxItems": 52, "items": NUM},
                    "lc": {"type": ["string", "null"]}}}}}}),
    (re.compile(rf"^fire/daily/{H3}\.json$"), {
        "type": "object", "required": ["shard", "epoch", "cells"],
        "properties": {
            "shard": STR, "epoch": STR,
            "cells": {"type": "object", "additionalProperties": {
                "type": "object", "required": ["d"],
                "properties": {"d": {"type": "array", "items": {
                    "type": "array", "minItems": 2, "maxItems": 2,
                    "prefixItems": [{"type": "number"},
                                    {"type": "number"}],
                    "items": False}}}}}}}),
    (re.compile(rf"^risk/{H3}\.json$"), {
        "type": "object", "required": ["generated_at", "cells"],
        "properties": {
            "generated_at": STR, "horizon_days": NUM,
            "cells": {"type": "object", "additionalProperties": {
                "type": "object",
                "required": ["p", "clim", "cat", "level"],
                "properties": {
                    "p": {"type": "number"}, "clim": {"type": "number"},
                    "ratio": NUM,
                    "cat": {"enum": ["bajo", "moderado", "alto",
                                     "muy_alto"]},
                    "level": {"enum": ["historial", "clima"]},
                    "model_version": STR,
                    "reasons": {"type": "array", "items": STR}}}}}}),
    (re.compile(rf"^field/grid/{H3}\.json$"), {
        "type": "object", "required": ["shard", "cells"],
        "properties": {
            "shard": STR,
            "cells": {"type": "object", "additionalProperties": {
                "type": "object",
                "properties": {
                    "frost_free": {"type": ["object", "null"], "properties": {
                        "start": {"type": "string", "pattern": MD},
                        "end": {"type": "string", "pattern": MD}}},
                    "grace_trend": {"enum": ["up", "flat", "down", None]},
                    "src": {"type": "object"}},
                "required": ["src"]}}}}),
    (re.compile(rf"^field/analogs/{H3}\.json$"), {
        "type": "object", "required": ["cells"],
        "properties": {
            "cells": {"type": "object", "additionalProperties": {
                "type": "object",
                "required": ["cluster", "label", "n_cells"],
                "properties": {"cluster": {"type": "integer"},
                               "label": STR,
                               "n_cells": {"type": "integer"},
                               "ar_crops": {"type": "array"}}}}}}),
    (re.compile(r"^api/diagnose\.response\.json$"), {
        "type": "object",
        "required": ["diagnosis_id", "area_ha", "centroid", "h3_r5",
                     "h3_r6", "cards", "calendar"],
        "properties": {
            "cards": {"type": "array", "items": CARD},
            "calendar": {"type": "object",
                         "required": ["months", "rows"],
                         "properties": {
                             "months": {"type": "array", "minItems": 12,
                                        "maxItems": 12},
                             "rows": {"type": "array",
                                      "items": CAL_ROW}}},
            "measures": {"type": "array", "items": MEASURE}}}),
    (re.compile(r"^api/live\.response\.json$"), {
        "type": "object", "required": ["window_h", "bbox", "mode"]}),
    (re.compile(r"^api/rotations\.response\.json$"), {
        "type": "object", "required": ["diagnosis_id", "strategies",
                                       "disclaimer"],
        "properties": {
            "strategies": {"type": "array", "minItems": 4, "maxItems": 4,
                           "items": {"type": "object", "required": [
                               "id", "name", "is_current", "score",
                               "sequence", "why", "evidence", "benefits",
                               "gaps", "risks"]}},
            "disclaimer": STR}}),
    (re.compile(r"^knowledge/crops\.json$"), {
        "type": "object", "required": ["crops"],
        "properties": {"crops": {"type": "array", "minItems": 1,
                                 "items": {"type": "object", "required": [
                                     "id", "name", "family",
                                     "water_mm_cycle", "sources"]}}}}),
    (re.compile(r"^knowledge/rotations\.json$"), {
        "type": "object", "required": ["rotations"],
        "properties": {"rotations": {"type": "array", "minItems": 1,
                                     "items": {"type": "object",
                                               "required": [
                                                   "id", "name",
                                                   "sequence",
                                                   "sources"]}}}}),
    (re.compile(r"^knowledge/measures\.json$"), {
        "type": "object", "required": ["measures"],
        "properties": {"measures": {"type": "array", "minItems": 1,
                                    "items": {"type": "object",
                                              "required": [
                                                  "id", "name", "factor",
                                                  "triggers",
                                                  "sources"]}}}}),
]

POINTS_HEADER = {"acq_date", "acq_time", "lat", "lon", "sensor",
                 "satellite", "frp", "confidence", "daynight", "h3_r5"}
POINTS_RE = re.compile(rf"^fire/points/{H3}/\d{{4}}\.csv\.gz$")


def _check(path: str, raw: bytes):
    """-> None if ok, else error string."""
    rel = path.replace("\\", "/")
    if POINTS_RE.match(rel):
        try:
            header = gzip.decompress(raw).split(b"\n", 1)[0].decode()
        except Exception as exc:
            return f"gunzip: {exc}"
        missing = POINTS_HEADER - set(header.strip().split(","))
        return f"missing columns {sorted(missing)}" if missing else None
    for rx, schema in SCHEMAS:
        if rx.match(rel):
            try:
                data = json.loads(raw)
            except Exception as exc:
                return f"bad json: {exc}"
            try:
                jsonschema.validate(data, schema)
            except jsonschema.ValidationError as exc:
                return exc.message[:160]
            return None
    return "SKIP"


def _iter_files(root: Path):
    for p in sorted(root.rglob("*")):
        if p.is_file():
            yield p.relative_to(root), p.read_bytes()


def main(argv):
    target = argv[1] if len(argv) > 1 else "fixtures"
    fails = 0
    if target.startswith("http"):
        paths = ["meta.json"] + argv[2:]
        for rel in paths:
            try:
                raw = urllib.request.urlopen(
                    f"{target.rstrip('/')}/{rel}", timeout=10).read()
            except Exception as exc:
                print(f"FAIL {rel}: fetch {exc}")
                fails += 1
                continue
            err = _check(rel, raw)
            print(("FAIL " if err else "ok ") + rel +
                  (f": {err}" if err else ""))
            fails += bool(err)
    else:
        for rel, raw in _iter_files(Path(target)):
            err = _check(str(rel), raw)
            if err == "SKIP":
                print(f"skip {rel}")
            elif err:
                print(f"FAIL {rel}: {err}")
                fails += 1
            else:
                print(f"ok {rel}")
    print(f"--- {fails} error(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
