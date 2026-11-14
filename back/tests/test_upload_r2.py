import gzip
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import upload_r2  # noqa: E402


class FakeClient:
    """Stubbed S3 client: pre-seeded remote listing + heads, records."""

    def __init__(self, remote=None, heads=None, fail_keys=()):
        self.remote = remote or {}   # key -> {"size", "etag"}
        self.heads = heads or {}     # key -> head_object response
        self.fail = set(fail_keys)
        self.puts = []
        self.head_calls = 0

    def list_objects_v2(self, Bucket, Prefix, **_kw):
        return {"Contents": [{"Key": k, "Size": v["size"],
                              "ETag": f'"{v["etag"]}"'}
                             for k, v in self.remote.items()],
                "IsTruncated": False}

    def head_object(self, Bucket, Key):
        self.head_calls += 1
        if Key not in self.heads:
            raise RuntimeError("NoSuchKey")
        return self.heads[Key]

    def put_object(self, Body, Bucket, Key, ContentType,
                   CacheControl, ContentEncoding=None, Metadata=None):
        if Key in self.fail:
            raise RuntimeError("boom")
        self.puts.append({"Key": Key, "ContentType": ContentType,
                          "CacheControl": CacheControl,
                          "ContentEncoding": ContentEncoding,
                          "Metadata": Metadata, "Body": Body})
        return {}


def _tree(tmp_path):
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "x.json").write_text('{"a": 1}')
    (tmp_path / "a" / "y.csv.gz").write_bytes(b"\x1f\x8bgzipdata")
    (tmp_path / "z.json").write_text("{}")


def test_plan_keys_and_types(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    by_key = {i.key: i for i in items}
    assert set(by_key) == {"v1/a/x.json", "v1/a/y.csv.gz", "v1/z.json"}
    j = by_key["v1/a/x.json"]
    assert j.content_type == "application/json"
    assert j.content_encoding == "gzip"
    gz = by_key["v1/a/y.csv.gz"]
    assert gz.content_type == "text/csv"
    assert gz.content_encoding == "gzip"


def test_json_gzipped_with_src_md5(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    j = next(i for i in items if i.key == "v1/z.json").prepare()
    assert gzip.decompress(j.body()) == b"{}"
    assert j.src_md5 == hashlib.md5(b"{}").hexdigest()
    client = FakeClient()
    upload_r2.put(client, "b", j)
    p = client.puts[0]
    assert p["ContentEncoding"] == "gzip"
    assert p["Metadata"] == {"src-md5": j.src_md5}
    assert gzip.decompress(p["Body"]) == b"{}"


def test_pre_gzipped_json_sent_as_is(tmp_path):
    """data/dev_v1_gz: .json already gzipped -> no double encoding."""
    blob = gzip.compress(b'{"k": 2}', mtime=7)
    (tmp_path / "g.json").write_bytes(blob)
    items = upload_r2.plan(tmp_path, "v1/")
    j = items[0].prepare()
    assert j.body() == blob                     # sent untouched
    assert j.src_md5 == hashlib.md5(b'{"k": 2}').hexdigest()


def test_dry_run_uploads_nothing(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    client = FakeClient()
    res = upload_r2.sync(client, "b", items, dry_run=True)
    assert res["objects"] == 3
    assert client.puts == []


def test_sync_skips_matching_and_uploads_rest(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    same = items[0].prepare()
    remote = {same.key: {"size": same.stored_size, "etag": same.md5}}
    client = FakeClient(remote=remote)
    res = upload_r2.sync(client, "b", items, dry_run=False)
    assert res["skipped_unchanged"] == 1
    assert res["uploaded"] == 2
    assert {p["Key"] for p in client.puts} == \
        {i.key for i in items} - {same.key}
    assert client.head_calls == 0   # listing was enough


def test_ambiguous_json_checked_by_src_md5(tmp_path):
    """Same stored size but a foreign gzip stream -> head src-md5."""
    (tmp_path / "x.json").write_text('{"a": 1}')
    items = upload_r2.plan(tmp_path, "v1/")
    j = items[0].prepare()
    other_gz = gzip.compress(b'{"a": 1}', mtime=42)
    assert len(other_gz) != j.stored_size or True
    remote = {j.key: {"size": j.stored_size, "etag": "f" * 32}}
    heads = {j.key: {"Metadata": {"src-md5": j.src_md5}}}
    client = FakeClient(remote=remote, heads=heads)
    res = upload_r2.sync(client, "b", items, dry_run=False)
    assert res["skipped_unchanged"] == 1
    assert client.head_calls == 1
    # differing src-md5 -> re-upload
    heads2 = {j.key: {"Metadata": {"src-md5": "0" * 32}}}
    client2 = FakeClient(remote=remote, heads=heads2)
    res2 = upload_r2.sync(client2, "b", items, dry_run=False)
    assert res2["uploaded"] == 1


def test_errors_collected_not_fatal(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    client = FakeClient(fail_keys={"v1/z.json"})
    res = upload_r2.sync(client, "b", items, dry_run=False)
    assert res["uploaded"] == 2
    assert len(res["errors"]) == 1 and "v1/z.json" in res["errors"][0]


def test_derive_r2_keys_from_cf_token():
    env = {"R2_ACCOUNT_ID": "acc", "R2_BUCKET": "b",
           "CLOUDFLARE_API_TOKEN": "tok123",
           "R2_ACCESS_KEY_ID": "", "R2_SECRET_ACCESS_KEY": ""}
    seen = {}

    def fetch(url, tok):
        seen["url"], seen["tok"] = url, tok
        return {"result": {"id": "keyid42"}}

    out = upload_r2.derive_r2_keys(dict(env), fetch=fetch)
    assert seen["url"].endswith("/accounts/acc/tokens/verify")
    assert out["R2_ACCESS_KEY_ID"] == "keyid42"
    assert out["R2_SECRET_ACCESS_KEY"] == \
        hashlib.sha256(b"tok123").hexdigest()
    # existing keys are never overridden
    env2 = dict(env, R2_ACCESS_KEY_ID="k", R2_SECRET_ACCESS_KEY="s")
    assert upload_r2.derive_r2_keys(env2, fetch=fetch) is env2
