import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import upload_r2  # noqa: E402


class FakeClient:
    """Stubbed S3 client: pre-seeded remote state, records puts."""

    def __init__(self, remote=None, fail_keys=()):
        self.remote = remote or {}       # key -> {"ContentLength", "ETag"}
        self.fail = set(fail_keys)
        self.puts = []

    def head_object(self, Bucket, Key):
        if Key not in self.remote:
            raise RuntimeError("NoSuchKey")
        return self.remote[Key]

    def put_object(self, Body, Bucket, Key, ContentType,
                   CacheControl, ContentEncoding=None):
        if Key in self.fail:
            raise RuntimeError("boom")
        self.puts.append({"Key": Key, "ContentType": ContentType,
                          "CacheControl": CacheControl,
                          "ContentEncoding": ContentEncoding})
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
    assert by_key["v1/a/x.json"].content_type == "application/json"
    gz = by_key["v1/a/y.csv.gz"]
    assert gz.content_type == "text/csv"
    assert gz.content_encoding == "gzip"
    assert gz.md5 == hashlib.md5(b"\x1f\x8bgzipdata").hexdigest()


def test_dry_run_uploads_nothing(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    client = FakeClient()
    res = upload_r2.sync(client, "b", items, dry_run=True)
    assert res["objects"] == 3
    assert res["bytes"] == sum(i.size for i in items)
    assert client.puts == []


def test_sync_skips_matching_and_uploads_rest(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    same = items[0]
    remote = {same.key: {"ContentLength": same.size,
                         "ETag": f'"{same.md5}"'}}
    client = FakeClient(remote=remote)
    res = upload_r2.sync(client, "b", items, dry_run=False)
    assert res["skipped_unchanged"] == 1
    assert res["uploaded"] == 2
    assert {p["Key"] for p in client.puts} == \
        {i.key for i in items} - {same.key}
    assert all(p["CacheControl"] == upload_r2.CACHE_CONTROL
               for p in client.puts)


def test_errors_collected_not_fatal(tmp_path):
    _tree(tmp_path)
    items = upload_r2.plan(tmp_path, "v1/")
    client = FakeClient(fail_keys={"v1/z.json"})
    res = upload_r2.sync(client, "b", items, dry_run=False)
    assert res["uploaded"] == 2
    assert len(res["errors"]) == 1 and "v1/z.json" in res["errors"][0]
