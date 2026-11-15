"""Prune retired prefixes from the R2 bucket (task 51).

The Fire and Live modes were removed from the app; nothing reads
`v1/globe/`, `v1/fire/daily/` or `v1/fire/points/` any more. This tool
lists what a prune would remove and, only when explicitly armed,
deletes it in batches.

    python tools/prune_r2.py                                  # dry run
    python tools/prune_r2.py --delete \
        --confirm-prefixes globe,fire/daily,fire/points      # actually delete

DRY RUN IS THE DEFAULT: it lists the objects under each retired prefix
(paginated `list_objects_v2`), prints counts and total bytes, and never
calls `delete_objects`.

`--delete` alone is not enough: it additionally requires
`--confirm-prefixes` with the exact, complete retired list typed out.
Before deleting anything the tool writes an audit manifest
(`data/prune-manifest-<date>.json`, git-ignored: key, size, ETag of
every object it is about to remove) and verifies the keep-list is
intact: at least one object must exist under every kept prefix and the
kept top-level files must be present — an empty keep-list means the
listing is untrustworthy and the tool aborts.

Hard limits (never overridable):
  * only prefixes inside DELETE_PREFIXES can be listed/deleted;
  * every deleted key must start with `v1/`;
  * keys outside the retired prefixes are never touched.
"""

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
load_dotenv(ROOT / ".env", override=False)

import upload_r2  # noqa: E402

# Retired by the Fire/Live mode removal (docs/ops/r2-layout.md). The
# ONLY prefixes this tool may ever delete.
DELETE_PREFIXES = ("v1/globe/", "v1/fire/daily/", "v1/fire/points/")

# What must stay: the guard lists each of these and aborts when any
# comes back empty — an empty keep prefix means the listing (or the
# bucket) is broken, not that the keep data is gone.
KEEP_PREFIXES = (
    "v1/risk/", "v1/fire/cal/", "v1/field/grid/", "v1/field/analogs/",
    "v1/knowledge/", "v1/orin/",
)
KEEP_KEYS = ("v1/ecostress_demo.json", "v1/meta.json")

BATCH = 1000            # S3 delete_objects hard limit
RETRIES = 5
THROTTLE_CODES = {
    "SlowDown", "Throttling", "ThrottlingException",
    "TooManyRequestsException", "ServiceUnavailable", "503",
}


def confirm_arg() -> str:
    """The exact --confirm-prefixes value that arms deletion."""
    return ",".join(p[len("v1/"):-1] for p in DELETE_PREFIXES)


def check_prefixes(prefixes: list[str]) -> list[str]:
    """Allow-list guard: every requested prefix must be retired."""
    bad = [p for p in prefixes if p not in DELETE_PREFIXES]
    if bad:
        raise SystemExit(
            f"refusing: {bad} outside the retired allow-list "
            f"{list(DELETE_PREFIXES)}")
    return prefixes


def list_prefix(client, bucket: str, prefix: str) -> list[dict]:
    """Every object under prefix (paginated): key, size, etag."""
    out, kwargs = [], {"Bucket": bucket, "Prefix": prefix}
    while True:
        r = client.list_objects_v2(**kwargs)
        for o in r.get("Contents", []):
            out.append({"key": o["Key"], "size": o["Size"],
                        "etag": (o.get("ETag") or "").strip('"')})
        if not r.get("IsTruncated"):
            return out
        kwargs["ContinuationToken"] = r["NextContinuationToken"]


def check_keep_list(client, bucket: str) -> None:
    """Abort unless every kept prefix/file still has objects."""
    empty = [p for p in KEEP_PREFIXES
             if not list_prefix(client, bucket, p)]
    missing = []
    for key in KEEP_KEYS:
        r = client.list_objects_v2(
            Bucket=bucket, Prefix=key, MaxKeys=1)
        if not any(o["Key"] == key for o in r.get("Contents", [])):
            missing.append(key)
    if empty or missing:
        raise SystemExit(
            "keep-list check failed, aborting — expected objects "
            f"missing under {empty + missing}. The bucket listing is "
            "untrustworthy; nothing was deleted.")


def write_manifest(objects: list[dict], bucket: str,
                   manifest_dir: Path) -> Path:
    """Audit record written BEFORE any deletion call."""
    manifest_dir.mkdir(parents=True, exist_ok=True)
    path = manifest_dir / f"prune-manifest-{date.today().isoformat()}.json"
    path.write_text(json.dumps({
        "bucket": bucket,
        "generated_at": date.today().isoformat(),
        "object_count": len(objects),
        "total_bytes": sum(o["size"] for o in objects),
        "prefixes": list(DELETE_PREFIXES),
        "objects": objects,
    }, indent=1), encoding="utf-8")
    return path


def is_throttle(exc: Exception) -> bool:
    code = getattr(exc, "response", {}) \
        .get("Error", {}).get("Code", "")
    return code in THROTTLE_CODES


def delete_keys(client, bucket: str, keys: list[str],
                out=print) -> list[str]:
    """delete_objects in <=1000-key batches with throttle retries.

    Returns the per-key error list (empty on success).
    """
    errors: list[str] = []
    for start in range(0, len(keys), BATCH):
        batch = keys[start:start + BATCH]
        for attempt in range(RETRIES + 1):
            try:
                r = client.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": [{"Key": k} for k in batch],
                            "Quiet": True})
                for e in r.get("Errors", []):
                    errors.append(f"{e.get('Key')}: "
                                  f"{e.get('Code')} {e.get('Message')}")
                break
            except Exception as exc:
                if is_throttle(exc) and attempt < RETRIES:
                    time.sleep(2 ** attempt)
                    continue
                errors.append(
                    f"batch {start}-{start + len(batch)}: "
                    f"{type(exc).__name__} {exc}")
                break
        out(f"  deleted batch {start // BATCH + 1}: "
            f"{min(start + BATCH, len(keys))}/{len(keys)} keys",
            flush=True)
    return errors


def run(client, bucket: str, *, delete: bool, confirm: str | None,
        manifest_dir: Path = ROOT / "data", out=print) -> int:
    """List (dry run) or delete the retired prefixes. Test entry point."""
    check_prefixes(list(DELETE_PREFIXES))
    if delete and confirm != confirm_arg():
        raise SystemExit(
            f"--delete requires --confirm-prefixes {confirm_arg()} "
            "typed exactly")

    objects: list[dict] = []
    for p in DELETE_PREFIXES:
        objs = list_prefix(client, bucket, p)
        objects.extend(objs)
        size = sum(o["size"] for o in objs)
        out(f"{p:<22} {len(objs):>6} objects  {size / 1e6:>9.1f} MB",
            flush=True)
    total = sum(o["size"] for o in objects)
    out(f"{'TOTAL':<22} {len(objects):>6} objects  "
        f"{total / 1e6:>9.1f} MB", flush=True)

    if any(not o["key"].startswith("v1/") for o in objects):
        raise SystemExit("refusing: a key outside v1/ was listed; "
                         "nothing was deleted")

    if not delete:
        out("[DRY-RUN] nothing deleted. Re-run with --delete "
            f"--confirm-prefixes {confirm_arg()} to proceed.")
        return 0

    check_keep_list(client, bucket)
    path = write_manifest(objects, bucket, manifest_dir)
    out(f"manifest: {path} ({len(objects)} objects recorded)")
    errors = delete_keys(client, bucket, [o["key"] for o in objects],
                         out=out)
    for e in errors:
        out(f"  ERROR {e}")
    out(f"[DELETE] {len(objects) - len(errors)} deleted, "
        f"{len(errors)} errors" if errors else
        f"[DELETE] {len(objects)} objects deleted")
    return 1 if errors else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--delete", action="store_true",
                    help="actually delete (default is a read-only "
                         "dry run)")
    ap.add_argument("--confirm-prefixes", default=None,
                    help="required with --delete: the exact retired "
                         f"list '{confirm_arg()}'")
    args = ap.parse_args()

    env, client = upload_r2.make_client()
    return run(client, env["R2_BUCKET"], delete=args.delete,
               confirm=args.confirm_prefixes)


if __name__ == "__main__":
    sys.exit(main())
