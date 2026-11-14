"""Upload a local folder to a Cloudflare R2 bucket via the S3 API.

Usage:
    python tools/upload_r2.py <local_dir> [--prefix v1/] [--upload]

`--dry-run` is the default: prints object counts and total bytes without
touching the bucket. `--upload` performs the sync (16 parallel workers,
idempotent: objects whose size and MD5 already match are skipped, so a
rerun after a failure only sends what is missing or changed).

Credentials come from the environment or the repo-root .env:
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Objects are uploaded with `Cache-Control: public, max-age=3600`.
`.csv.gz` files go up as `text/csv` + `Content-Encoding: gzip` so clients
transparently decompress them; `.json` goes as `application/json`.
"""

import argparse
import hashlib
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

CACHE_CONTROL = "public, max-age=3600"
WORKERS = 16
REQUIRED_ENV = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY", "R2_BUCKET")


@dataclass
class Item:
    local: Path
    key: str
    size: int
    md5: str
    content_type: str
    content_encoding: str | None = None


def content_meta(path: Path) -> tuple[str, str | None]:
    """(Content-Type, Content-Encoding) for an upload."""
    if path.name.endswith(".csv.gz"):
        return "text/csv", "gzip"
    if path.suffix == ".json":
        return "application/json", None
    return mimetypes.guess_type(str(path))[0] or \
        "application/octet-stream", None


def plan(local_dir: Path, prefix: str) -> list[Item]:
    """Every regular file under local_dir -> (key, metadata)."""
    items = []
    for p in sorted(local_dir.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(local_dir).as_posix()
        ct, ce = content_meta(p)
        items.append(Item(
            local=p, key=prefix + rel, size=p.stat().st_size,
            md5=hashlib.md5(p.read_bytes()).hexdigest(),
            content_type=ct, content_encoding=ce))
    return items


def needs_upload(client, bucket: str, item: Item) -> bool:
    """False when the remote object already matches size + MD5."""
    try:
        head = client.head_object(Bucket=bucket, Key=item.key)
    except Exception:
        return True
    remote_md5 = (head.get("ETag") or "").strip('"')
    return not (head.get("ContentLength") == item.size
                and remote_md5 == item.md5)


def put(client, bucket: str, item: Item) -> str:
    args = {"Bucket": bucket, "Key": item.key,
            "ContentType": item.content_type,
            "CacheControl": CACHE_CONTROL}
    if item.content_encoding:
        args["ContentEncoding"] = item.content_encoding
    with item.local.open("rb") as fh:
        client.put_object(Body=fh, **args)
    return item.key


def sync(client, bucket: str, items: list[Item],
         dry_run: bool = True) -> dict:
    """Upload items (or report them when dry_run). Resume-safe.

    `client=None` means a credential-free dry-run: every object counts
    as pending, no head_object calls are made.
    """
    todo = items if client is None else \
        [i for i in items if needs_upload(client, bucket, i)]
    skipped = len(items) - len(todo)
    result = {"objects": len(items), "skipped_unchanged": skipped,
              "bytes": sum(i.size for i in todo),
              "uploaded": 0, "errors": []}
    if dry_run:
        return result
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(put, client, bucket, i): i for i in todo}
        for f in as_completed(futs):
            try:
                f.result()
                result["uploaded"] += 1
            except Exception as exc:  # collect, keep going (resume-safe)
                result["errors"].append(
                    f"{futs[f].key}: {type(exc).__name__} {exc}")
    return result


def make_client():
    import boto3
    env = {k: (os.environ.get(k) or "").strip() for k in REQUIRED_ENV}
    missing = [k for k, v in env.items() if not v]
    if missing:
        raise SystemExit(
            f"missing env vars: {', '.join(missing)} "
            "(set them or add to the repo-root .env)")
    return env, boto3.client(
        "s3",
        endpoint_url=(f"https://{env['R2_ACCOUNT_ID']}"
                      ".r2.cloudflarestorage.com"),
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("local_dir", type=Path)
    ap.add_argument("--prefix", default="v1/",
                    help="R2 key prefix (default v1/)")
    ap.add_argument("--upload", action="store_true",
                    help="actually upload (default is --dry-run)")
    args = ap.parse_args()
    if not args.local_dir.is_dir():
        raise SystemExit(f"not a directory: {args.local_dir}")
    prefix = args.prefix if args.prefix.endswith("/") \
        else args.prefix + "/"

    items = plan(args.local_dir, prefix)
    if args.upload:
        env, client = make_client()
    else:
        env = {k: (os.environ.get(k) or "").strip()
               for k in REQUIRED_ENV}
        client = None  # credential-free dry-run
    bucket = env.get("R2_BUCKET") or "<bucket>"
    print(f"{len(items)} objects under {args.local_dir} -> "
          f"s3://{bucket}/{prefix}", flush=True)
    res = sync(client, bucket, items, dry_run=not args.upload)
    mode = "DRY-RUN" if not args.upload else "UPLOAD"
    print(f"[{mode}] {res['objects']} objects, "
          f"{res['skipped_unchanged']} unchanged, "
          f"{res['uploaded']} uploaded, "
          f"{res['bytes'] / 1e6:.1f} MB to send", flush=True)
    for e in res["errors"]:
        print(f"  ERROR {e}", flush=True)
    return 1 if res["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
