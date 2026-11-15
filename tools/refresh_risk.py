"""Refresh the Argentine `clima` fire-risk shards end to end.

    python tools/refresh_risk.py [--no-upload] [--stage r2-stage-risk]

One command runs the full pipeline:
  1. predict    model/fire_risk/predict.py (fresh FIRMS data)
  2. validate   back/tools/validate_contract.py data/processed
  3. stage      copy data/processed/risk/*.json into the stage dir
  4. dry-run    tools/upload_r2.py <stage> --prefix v1/risk/
  5. upload     same command with --upload (skipped by --no-upload)
  6. verify     tools/verify_r2.py --prefix v1/risk/ plus a public-URL
                fetch of 3 random shards through DATA_BASE_URL

Only the Argentine `clima` shards under data/processed/risk are staged;
the worldwide `historial` shards under v1/risk/ are never touched by
this script (they are not part of the local risk dir).

Needs: FIRMS key + POWER parquet + model for step 1; R2 credentials
(R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY or
CLOUDFLARE_API_TOKEN) and DATA_BASE_URL for steps 5-6. Secrets are
loaded from the repo-root .env and never printed.
"""

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
GZIP_MAGIC = b"\x1f\x8b"


def run(step: str, cmd: list[str]) -> None:
    print(f"\n== {step} ==\n  $ {' '.join(cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(f"{step} failed (exit {r.returncode})")


def verify_public(stage: Path, n: int = 3) -> None:
    """Fetch n staged shards through DATA_BASE_URL and compare."""
    import gzip
    from dotenv import dotenv_values
    base = (os.environ.get("DATA_BASE_URL")
            or dotenv_values(ROOT / ".env").get("DATA_BASE_URL")
            or "").rstrip("/")
    if not base:
        print("  DATA_BASE_URL not set; public check skipped")
        return
    shards = random.Random(0).sample(
        sorted(stage.glob("*.json")), min(n, len(list(stage.glob('*.json')))))
    for fp in shards:
        url = f"{base}/risk/{fp.name}"
        req = urllib.request.Request(
            url, headers={"User-Agent": "refresh-risk/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            if (r.headers.get("Content-Encoding") == "gzip"
                    or body[:2] == GZIP_MAGIC):
                body = gzip.decompress(body)
        remote = json.loads(body)
        local = json.loads(fp.read_text())
        ok = (remote.get("generated_at") == local.get("generated_at")
              and len(remote.get("cells", {}))
              == len(local.get("cells", {})))
        status = "ok" if ok else "MISMATCH"
        print(f"  {status} {fp.name} cells="
              f"{len(remote.get('cells', {}))}", flush=True)
        if not ok:
            raise SystemExit(f"public check failed for {fp.name}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-upload", action="store_true",
                    help="stop after the dry-run (no S3 changes)")
    ap.add_argument("--stage", type=Path,
                    default=ROOT / "r2-stage-risk")
    ap.add_argument("--skip-predict", action="store_true",
                    help="reuse data/processed/risk as-is")
    args = ap.parse_args()
    stage = args.stage

    if not args.skip_predict:
        run("predict", [PY, "model/fire_risk/predict.py"])
    run("validate", [PY, "back/tools/validate_contract.py",
                     "data/processed"])

    print(f"\n== stage == {stage}", flush=True)
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    files = sorted((ROOT / "data/processed/risk").glob("*.json"))
    for fp in files:
        shutil.copy(fp, stage)
    print(f"  staged {len(files)} clima shards", flush=True)

    run("dry-run", [PY, "tools/upload_r2.py", str(stage),
                    "--prefix", "v1/risk/"])
    if args.no_upload:
        print("\n--no-upload: stopping before S3 changes")
        return 0
    run("upload", [PY, "tools/upload_r2.py", str(stage),
                   "--prefix", "v1/risk/", "--upload"])
    run("verify", [PY, "tools/verify_r2.py", "--prefix", "v1/risk/"])
    print("\n== public URL check ==", flush=True)
    verify_public(stage)
    print("\nrefresh complete", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
