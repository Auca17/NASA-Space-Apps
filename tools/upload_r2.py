"""Upload a local folder to a Cloudflare R2 bucket via the S3 API.

Usage:
    python tools/upload_r2.py <local_dir> [--prefix v1/] [--upload]

`--dry-run` is the default: prints object counts and total bytes without
touching the bucket. `--upload` performs the sync (16 parallel workers,
idempotent: one paginated `list_objects_v2` over the prefix replaces
per-object HEAD calls; unchanged objects are skipped, so a rerun after
a failure only sends what is missing or changed).

Credentials come from the environment or the repo-root .env:
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
When the R2 key pair is missing but `CLOUDFLARE_API_TOKEN` is set, the
pair is derived from the token (Access Key ID = token id from the
Cloudflare verify endpoint; secret = SHA-256 hex of the token value).
They are never printed or stored.

Objects are uploaded with `Cache-Control: public, max-age=3600`.
`.json` files are gzipped in memory (deterministic, mtime=0) and sent
as `application/json` + `Content-Encoding: gzip` because the r2.dev
domain does not compress; the MD5 of the original JSON travels in the
object metadata `x-amz-meta-src-md5` for resume-safe comparison.
`.csv.gz` files go up as `text/csv` + `Content-Encoding: gzip`.
"""

import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from urllib.request import Request, urlopen

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

CACHE_CONTROL = "public, max-age=3600"
WORKERS = 16
PROGRESS_EVERY = 500
# v1-relative prefixes retired by the Fire/Live removal (task 51):
# excluded from uploads by default so a stale local export or dev_v1
# mirror can never resurrect them. `--exclude ""` opts out.
DEFAULT_EXCLUDE = ("globe", "fire/daily", "fire/points")
REQUIRED_ENV = ("R2_ACCOUNT_ID", "R2_BUCKET")
_KEY_ENV = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
GZIP_MAGIC = b"\x1f\x8b"


@dataclass
class Item:
    local: Path
    key: str
    content_type: str
    content_encoding: str | None = None
    is_json: bool = False
    # prepared lazily: md5 of stored bytes / md5 of original JSON /
    # stored (gzipped) bytes / stored size
    md5: str | None = field(default=None, repr=False)
    src_md5: str | None = field(default=None, repr=False)
    stored_size: int | None = field(default=None, repr=False)
    _body: bytes | None = field(default=None, repr=False)

    def prepare(self) -> "Item":
        """Compute stored bytes + hashes on first use."""
        if self.md5 is not None:
            return self
        data = self.local.read_bytes()
        if self.is_json:
            if data[:2] == GZIP_MAGIC:
                raw, stored = gzip.decompress(data), data
            else:
                raw = data
                stored = gzip.compress(data, compresslevel=9, mtime=0)
            self.src_md5 = hashlib.md5(raw).hexdigest()
            self._body = stored
        else:
            self._body = data
        self.stored_size = len(self._body)
        self.md5 = hashlib.md5(self._body).hexdigest()
        return self

    def body(self) -> bytes:
        return self.prepare()._body


def content_meta(path: Path) -> tuple[str, str | None]:
    """(Content-Type, Content-Encoding) for an upload."""
    if path.name.endswith(".csv.gz"):
        return "text/csv", "gzip"
    if path.suffix == ".json":
        return "application/json", "gzip"
    return mimetypes.guess_type(str(path))[0] or \
        "application/octet-stream", None


def plan(local_dir: Path, prefix: str,
         exclude: list[str] | None = None) -> list[Item]:
    """Every regular file under local_dir -> (key, metadata).

    `exclude` holds v1-relative prefixes (e.g. "fire/daily"); any file
    whose resulting key lands under v1/<entry>/ is skipped, whatever
    --prefix is in use.
    """
    retired = [e.strip("/") for e in (exclude or []) if e.strip("/")]
    items = []
    for p in sorted(local_dir.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(local_dir).as_posix()
        key = prefix + rel
        if any(key.startswith(f"v1/{e}/") for e in retired):
            continue
        ct, ce = content_meta(p)
        items.append(Item(
            local=p, key=key, is_json=p.suffix == ".json",
            content_type=ct, content_encoding=ce))
    return items


def list_remote(client, bucket: str, prefix: str) -> dict:
    """key -> {size, etag} for every object under prefix (paginated)."""
    out, kwargs = {}, {"Bucket": bucket, "Prefix": prefix}
    while True:
        r = client.list_objects_v2(**kwargs)
        for o in r.get("Contents", []):
            out[o["Key"]] = {"size": o["Size"],
                             "etag": (o.get("ETag") or "").strip('"')}
        if not r.get("IsTruncated"):
            return out
        kwargs["ContinuationToken"] = r["NextContinuationToken"]


def needs_upload(client, bucket: str, item: Item,
                 remote: dict) -> bool:
    """False when the remote object already matches.

    Fast path (zero HEAD calls): key absent -> upload; size+ETag match
    -> skip. Ambiguous = same stored size but different ETag on a .json
    (another gzip stream of the same source): one head_object compares
    the `src-md5` metadata of the original JSON.
    """
    r = remote.get(item.key)
    if r is None:
        return True
    item.prepare()
    if r["size"] == item.stored_size and r["etag"] == item.md5:
        return False
    if item.src_md5 and r["size"] == item.stored_size:
        try:
            head = client.head_object(Bucket=bucket, Key=item.key)
        except Exception:
            return True
        meta = (head.get("Metadata") or {}).get("src-md5")
        return meta != item.src_md5
    return True


def put(client, bucket: str, item: Item) -> str:
    args = {"Bucket": bucket, "Key": item.key,
            "ContentType": item.content_type,
            "CacheControl": CACHE_CONTROL}
    if item.content_encoding:
        args["ContentEncoding"] = item.content_encoding
    if item.src_md5:
        args["Metadata"] = {"src-md5": item.src_md5}
    client.put_object(Body=item.body(), **args)
    return item.key


def sync(client, bucket: str, items: list[Item],
         dry_run: bool = True, prefix: str = "") -> dict:
    """Upload items (or report them when dry_run). Resume-safe.

    `client=None` means a credential-free dry-run: every object counts
    as pending and no remote listing is fetched.
    """
    remote = {} if client is None else \
        list_remote(client, bucket, prefix)
    todo = [i for i in items
            if client is None or needs_upload(client, bucket, i, remote)]
    skipped = len(items) - len(todo)
    result = {"objects": len(items), "skipped_unchanged": skipped,
              "bytes": sum(
                  (i.stored_size if i.md5 is not None
                   else i.local.stat().st_size) for i in todo),
              "uploaded": 0, "errors": []}
    if dry_run:
        return result
    done = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(put, client, bucket, i): i for i in todo}
        for f in as_completed(futs):
            try:
                f.result()
                result["uploaded"] += 1
            except Exception as exc:  # collect, keep going (resume-safe)
                result["errors"].append(
                    f"{futs[f].key}: {type(exc).__name__} {exc}")
            done += 1
            if done % PROGRESS_EVERY == 0:
                print(f"  ... {done}/{len(todo)} objects", flush=True)
    return result


def derive_r2_keys(env: dict, fetch=None) -> dict:
    """Derive the R2 key pair from CLOUDFLARE_API_TOKEN.

    Access Key ID = the token's own id (Cloudflare verify endpoint);
    secret = SHA-256 hex of the token value. Returns a new env dict;
    never prints or stores the values.
    """
    token = (env.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if not token or not env.get("R2_ACCOUNT_ID"):
        return env
    if env.get("R2_ACCESS_KEY_ID") and env.get("R2_SECRET_ACCESS_KEY"):
        return env
    if fetch is None:
        def fetch(url, tok):
            req = Request(url, headers={"Authorization": f"Bearer {tok}"})
            with urlopen(req, timeout=15) as r:
                return json.loads(r.read())
    data = fetch(
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{env['R2_ACCOUNT_ID']}/tokens/verify", token)
    token_id = ((data or {}).get("result") or {}).get("id")
    if not token_id:
        raise SystemExit("CLOUDFLARE_API_TOKEN verify returned no id")
    env = dict(env)
    env["R2_ACCESS_KEY_ID"] = token_id
    env["R2_SECRET_ACCESS_KEY"] = hashlib.sha256(
        token.encode()).hexdigest()
    return env


def make_client():
    import boto3
    env = {k: (os.environ.get(k) or "").strip()
           for k in REQUIRED_ENV + _KEY_ENV + ("CLOUDFLARE_API_TOKEN",)}
    env = derive_r2_keys(env)
    missing = [k for k in REQUIRED_ENV + _KEY_ENV if not env.get(k)]
    if missing:
        raise SystemExit(
            f"missing env vars: {', '.join(missing)} "
            "(set them, add to the repo-root .env, or provide "
            "CLOUDFLARE_API_TOKEN to derive them)")
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
    ap.add_argument("--exclude", default=",".join(DEFAULT_EXCLUDE),
                    help="comma-separated v1/ prefixes to skip "
                         f"(default '{','.join(DEFAULT_EXCLUDE)}', "
                         "retired by the Fire/Live removal; "
                         "pass --exclude '' to opt out)")
    args = ap.parse_args()
    if not args.local_dir.is_dir():
        raise SystemExit(f"not a directory: {args.local_dir}")
    prefix = args.prefix if args.prefix.endswith("/") \
        else args.prefix + "/"

    items = plan(args.local_dir, prefix,
                 exclude=args.exclude.split(","))
    if args.upload:
        env, client = make_client()
    else:
        env = {k: (os.environ.get(k) or "").strip()
               for k in REQUIRED_ENV}
        client = None  # credential-free dry-run
    bucket = env.get("R2_BUCKET") or "<bucket>"
    print(f"{len(items)} objects under {args.local_dir} -> "
          f"s3://{bucket}/{prefix}", flush=True)
    res = sync(client, bucket, items,
               dry_run=not args.upload, prefix=prefix)
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
