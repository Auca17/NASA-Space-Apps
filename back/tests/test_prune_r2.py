"""tools/prune_r2.py safety checks (task 51) — stubbed S3, no network.

Covers the dry run, the --confirm-prefixes gate, the allow-list and
keep-list guards, <=1000-key delete batches, throttle retries, the
manifest written before any deletion, and the upload_r2 --exclude
default that keeps retired prefixes from being resurrected.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import prune_r2  # noqa: E402
import upload_r2  # noqa: E402


class ThrottleError(Exception):
    response = {"Error": {"Code": "SlowDown"}}


class FakeClient:
    """Bucket stub: dict key -> {size, etag}; records list/delete calls."""

    def __init__(self, objects=None, throttle_once=False,
                 manifest_path=None):
        self.objects = dict(objects or {})
        self.deleted: list[str] = []
        self.delete_calls: list[int] = []
        self.throttle_once = throttle_once
        self.manifest_seen_exists: bool | None = None
        self._manifest_path = manifest_path

    def list_objects_v2(self, Bucket, Prefix, MaxKeys=None,
                        ContinuationToken=None, **_kw):
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        return {"Contents": [{"Key": k, "Size": self.objects[k]["size"],
                              "ETag": f'"{self.objects[k]["etag"]}"'}
                             for k in keys],
                "IsTruncated": False}

    def delete_objects(self, Bucket, Delete, **_kw):
        if self.throttle_once:
            self.throttle_once = False
            raise ThrottleError("slow down")
        keys = [o["Key"] for o in Delete["Objects"]]
        if self._manifest_path is not None:
            self.manifest_seen_exists = self._manifest_path.exists()
        self.delete_calls.append(len(keys))
        for k in keys:
            self.objects.pop(k, None)
            self.deleted.append(k)
        return {"Errors": []}


def seed(bucket_extra=None, n_retired=5):
    """A healthy bucket: objects under every keep prefix/key plus the
    retired ones to be pruned."""
    objs = {}
    for p in prune_r2.KEEP_PREFIXES:
        objs[p + "keep1.json"] = {"size": 10, "etag": "a" * 32}
    for k in prune_r2.KEEP_KEYS:
        objs[k] = {"size": 5, "etag": "b" * 32}
    for p in prune_r2.DELETE_PREFIXES:
        for i in range(n_retired):
            objs[f"{p}o{i}.json"] = {"size": 100, "etag": "c" * 32}
    objs.update(bucket_extra or {})
    return objs


def lines():
    out = []
    return out, lambda s, **_kw: out.append(s)


def silent(*_a, **_kw):
    pass


# ---------------------------------------------------------------- dry run

def test_dry_run_lists_and_deletes_nothing():
    client = FakeClient(seed())
    out, emit = lines()
    rc = prune_r2.run(client, "b", delete=False, confirm=None, out=emit)
    assert rc == 0
    assert client.deleted == [] and client.delete_calls == []
    total = 5 * len(prune_r2.DELETE_PREFIXES)
    assert f"{total:>6} objects" in out[-1] or \
        any("DRY-RUN" in l for l in out)


def test_delete_requires_exact_confirm():
    client = FakeClient(seed())
    for bad in (None, "globe", "globe,fire/daily",
                "globe,fire/daily,fire/points "):
        with pytest.raises(SystemExit):
            prune_r2.run(client, "b", delete=True, confirm=bad,
                         out=silent)
    assert client.deleted == []


def test_confirm_string_matches_help():
    assert prune_r2.confirm_arg() == "globe,fire/daily,fire/points"


# ------------------------------------------------------------------ guards

def test_allow_list_refuses_other_prefixes():
    with pytest.raises(SystemExit):
        prune_r2.check_prefixes(["v1/risk/", "v1/meta.json"])
    with pytest.raises(SystemExit):
        prune_r2.check_prefixes(["v1/fire/cal/"])
    assert prune_r2.check_prefixes(
        list(prune_r2.DELETE_PREFIXES)) == list(prune_r2.DELETE_PREFIXES)


def test_keep_list_guard_aborts(tmp_path):
    """A bucket where a keep prefix is empty -> abort, nothing deleted."""
    objs = seed()
    for k in list(objs):
        if k.startswith("v1/risk/"):
            del objs[k]
        if k.startswith("v1/meta.json"):
            del objs[k]
    client = FakeClient(objs)
    with pytest.raises(SystemExit):
        prune_r2.run(client, "b", delete=True,
                     confirm=prune_r2.confirm_arg(),
                     manifest_dir=tmp_path, out=silent)
    assert client.deleted == []
    assert not list(tmp_path.glob("prune-manifest-*.json"))


def test_never_touches_keys_outside_v1(tmp_path):
    objs = seed({"v0/globe/old.json": {"size": 1, "etag": "d" * 32},
                 "v1/meta2.json": {"size": 1, "etag": "d" * 32}})
    client = FakeClient(objs)
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    assert "v0/globe/old.json" in client.objects
    assert "v1/meta2.json" in client.objects


# -------------------------------------------------------------- deletion

def test_batches_split_at_1000(tmp_path):
    objs = seed(n_retired=0)
    for i in range(2500):
        objs[f"v1/globe/g{i}.json"] = {"size": 1, "etag": "c" * 32}
    client = FakeClient(objs)
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    assert client.delete_calls == [1000, 1000, 500]
    assert len(client.deleted) == 2500


def test_manifest_written_before_deletion(tmp_path):
    objs = seed()
    client = FakeClient(objs)
    n = len([k for k in objs
             if any(k.startswith(p) for p in prune_r2.DELETE_PREFIXES)])
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    (manifest,) = tmp_path.glob("prune-manifest-*.json")
    data = json.loads(manifest.read_text())
    assert data["object_count"] == n
    assert {o["key"] for o in data["objects"]} == set(client.deleted)
    assert all(o["etag"] and o["size"] >= 0 for o in data["objects"])


def test_deletes_only_retired(tmp_path):
    objs = seed()
    client = FakeClient(objs)
    keep_keys = [k for k in objs
                 if not any(k.startswith(p)
                            for p in prune_r2.DELETE_PREFIXES)]
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    assert client.deleted and all(
        any(k.startswith(p) for p in prune_r2.DELETE_PREFIXES)
        for k in client.deleted)
    assert all(k in client.objects for k in keep_keys)


def test_throttle_retried(tmp_path):
    client = FakeClient(seed(), throttle_once=True)
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    assert client.deleted
    assert len(client.delete_calls) == 1  # succeeded on the retry


def test_manifest_exists_when_first_delete_runs(tmp_path):
    """delete_objects must never fire before the manifest is on disk."""
    from datetime import date
    manifest = tmp_path / \
        f"prune-manifest-{date.today().isoformat()}.json"
    client = FakeClient(seed(), manifest_path=manifest)
    prune_r2.run(client, "b", delete=True,
                 confirm=prune_r2.confirm_arg(),
                 manifest_dir=tmp_path, out=silent)
    assert client.delete_calls  # deletes happened
    assert client.manifest_seen_exists is True


# ------------------------------------------------- upload --exclude tests

def test_upload_plan_excludes_retired(tmp_path):
    for rel in ("globe/2024-01.json", "fire/daily/a.json",
                "fire/points/a/2020.csv.gz", "fire/cal/a.json",
                "risk/a.json", "meta.json"):
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("{}")
    items = upload_r2.plan(tmp_path, "v1/",
                           exclude=list(upload_r2.DEFAULT_EXCLUDE))
    keys = {i.key for i in items}
    assert keys == {"v1/fire/cal/a.json", "v1/risk/a.json",
                    "v1/meta.json"}


def test_upload_plan_exclude_opt_out(tmp_path):
    p = tmp_path / "globe" / "x.json"
    p.parent.mkdir()
    p.write_text("{}")
    items = upload_r2.plan(tmp_path, "v1/", exclude=[])
    assert {i.key for i in items} == {"v1/globe/x.json"}
    # and a nested-prefix upload is still blocked by the default
    items2 = upload_r2.plan(tmp_path / "globe", "v1/globe/",
                            exclude=list(upload_r2.DEFAULT_EXCLUDE))
    assert items2 == []
