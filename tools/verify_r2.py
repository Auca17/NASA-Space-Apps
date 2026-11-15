"""Verify the published v1/ tree in R2 against the local sources.

    python tools/verify_r2.py [--prefix v1/] [--spot 20] [--public]

Reports:
  - remote object counts grouped by second-level prefix
  - local files that are missing remotely
  - remote objects whose stored size differs from the local source
  - remote-only objects (present in the bucket, no local source)
  - a spot check of N random remote objects: downloads each one,
    gunzips when Content-Encoding is gzip, and parses the JSON.

Local source map (first match wins, ordered by authority):
  data/processed/export/v1/   -> v1/                (orchestrator export)
  data/processed/field/       -> v1/field/          (grid + analogs)
  data/processed/risk/        -> v1/risk/           (AR clima shards)
  back/knowledge/*.json       -> v1/knowledge/
  data/processed/orin/        -> v1/orin/           (validation + lots)
  data/processed/ecostress_demo.json -> v1/ecostress_demo.json
  data/dev_v1/                -> v1/                (published mirror,
                                only for keys not already mapped)

`--public` also fetches the spot-checked objects through the public
DATA_BASE_URL instead of the S3 API (note: r2.dev 403s urllib's default
User-Agent, so the tool sends its own).
"""

import argparse
import gzip
import hashlib
import json
import os
import random
import sys
from collections import Counter
from pathlib import Path
from urllib.request import Request, urlopen

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
load_dotenv(ROOT / ".env", override=False)

import upload_r2  # noqa: E402

GZIP_MAGIC = b"\x1f\x8b"
UA = {"User-Agent": "verify-r2/1.0"}

# local files present under orin/ that the orchestrator does NOT publish
ORIN_NOT_PUBLISHED = {"ndvi_modis_vs_s2.json"}


def local_sources() -> dict[str, Path]:
    """Expected R2 key -> local file, first mapping wins."""
    out: dict[str, Path] = {}

    def add(local: Path, prefix: str):
        if local.is_dir():
            for p in sorted(local.rglob("*")):
                if p.is_file():
                    key = prefix + p.relative_to(local).as_posix()
                    out.setdefault(key, p)
        else:
            out.setdefault(prefix + local.name, local)

    export = ROOT / "data/processed/export/v1"
    if export.is_dir():
        add(export, "v1/")
    grid = ROOT / "data/processed/field/grid"
    analogs = ROOT / "data/processed/field/analogs"
    if grid.is_dir():
        add(grid, "v1/field/grid/")
    if analogs.is_dir():
        add(analogs, "v1/field/analogs/")
    risk = ROOT / "data/processed/risk"
    if risk.is_dir():
        add(risk, "v1/risk/")
    know = ROOT / "back/knowledge"
    if know.is_dir():
        for p in sorted(know.glob("*.json")):
            add(p, "v1/knowledge/")
    orin = ROOT / "data/processed/orin"
    if orin.is_dir():
        for p in sorted(orin.glob("*")):
            if p.is_file() and p.name not in ORIN_NOT_PUBLISHED:
                add(p, "v1/orin/")
    eco = ROOT / "data/processed/ecostress_demo.json"
    if eco.is_file():
        add(eco, "v1/")
    mirror = ROOT / "data/dev_v1"
    if mirror.is_dir():
        add(mirror, "v1/")  # fills keys not already mapped above
    return out


def group(key: str) -> str:
    parts = key.split("/")
    if len(parts) > 3 and parts[1] in ("field", "fire"):
        return "/".join(parts[:3])
    return "/".join(parts[:2])


def fetch_public(base: str, key: str) -> bytes:
    with urlopen(Request(base + key, headers=UA), timeout=30) as r:
        body = r.read()
        if (r.headers.get("Content-Encoding") == "gzip"
                or body[:2] == GZIP_MAGIC):
            body = gzip.decompress(body)
        return body


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--prefix", default="v1/")
    ap.add_argument("--spot", type=int, default=20)
    ap.add_argument("--public", action="store_true",
                    help="spot-check through DATA_BASE_URL (public URL)")
    ap.add_argument("--seed", type=int, default=29)
    args = ap.parse_args()
    prefix = args.prefix if args.prefix.endswith("/") else \
        args.prefix + "/"

    env, client = upload_r2.make_client()
    remote = upload_r2.list_remote(client, env["R2_BUCKET"], prefix)
    local = {k: v for k, v in local_sources().items()
             if k.startswith(prefix)}

    counts = Counter(group(k) for k in remote)
    print(f"remote: {len(remote)} objects under s3://"
          f"{env['R2_BUCKET']}/{prefix}")
    for g, n in sorted(counts.items()):
        print(f"  {g:<28} {n}")

    # ---- local -> remote reconciliation ----------------------------------
    missing, mismatch = [], []
    for key, path in sorted(local.items()):
        r = remote.get(key)
        if r is None:
            missing.append(key)
            continue
        item = upload_r2.Item(
            local=path, key=key, is_json=path.suffix == ".json",
            content_type="", content_encoding=None).prepare()
        if r["size"] != item.stored_size and r["etag"] != item.md5:
            head = client.head_object(
                Bucket=env["R2_BUCKET"], Key=key)
            meta = (head.get("Metadata") or {}).get("src-md5")
            if meta != item.src_md5:
                mismatch.append((key, r["size"], item.stored_size))
    print(f"\nlocal sources mapped: {len(local)}")
    print(f"missing remotely: {len(missing)}")
    for k in missing[:20]:
        print(f"  MISSING {k}")
    print(f"size/content mismatches: {len(mismatch)}")
    for k, rs, ls in mismatch[:20]:
        print(f"  MISMATCH {k} remote={rs}B local={ls}B")

    remote_only = sorted(set(remote) - set(local))
    print(f"remote-only objects (no local source): {len(remote_only)}")
    by = Counter(group(k) for k in remote_only)
    for g, n in sorted(by.items()):
        print(f"  {g:<28} {n}")

    # ---- spot check --------------------------------------------------------
    keys = sorted(remote)
    sample = random.Random(args.seed).sample(
        keys, min(args.spot, len(keys)))
    base = (os.environ.get("DATA_BASE_URL") or "").rstrip("/")
    if args.public and not base:
        print("\n--public needs DATA_BASE_URL; falling back to S3",
              flush=True)
    ok = bad = 0
    print(f"\nspot check ({len(sample)} objects, "
          f"{'public URL' if args.public and base else 'S3 API'}):")
    for key in sample:
        try:
            if args.public and base:
                body = fetch_public(base + "/", key[len("v1/"):])
            else:
                obj = client.get_object(
                    Bucket=env["R2_BUCKET"], Key=key)
                body = obj["Body"].read()
                if (obj.get("ContentEncoding") == "gzip"
                        or body[:2] == GZIP_MAGIC):
                    body = gzip.decompress(body)
            if key.endswith(".json"):
                json.loads(body)
                note = ""
            else:
                note = " (non-JSON, download only)"
            ok += 1
            print(f"  ok    {key} ({len(body)}B{note})")
        except Exception as exc:
            bad += 1
            print(f"  FAIL  {key}: {type(exc).__name__} {exc}")
    print(f"\nspot check: {ok} ok, {bad} failed")
    return 1 if (missing or mismatch or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
