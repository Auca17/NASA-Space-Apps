"""In-process TTL cache shared by the /api endpoints.

Key shape: (h3_cell, utc_date, name). Field endpoints use res-6 cells in the
first slot; /api/risk caches shards keyed by their res-2 index in the same
slot. `name` namespaces entries that share a cell (e.g. "risk_shard").
"""

import time
from datetime import datetime, timezone


def utc_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class TTLCache:
    """Bounded: keys can embed user input (geocode queries), so expired
    entries are purged and the oldest evicted past MAX_ENTRIES instead
    of growing without limit."""

    MAX_ENTRIES = 4096

    def __init__(self) -> None:
        self._store: dict = {}

    def get(self, h3_cell: str, name: str, utc_date: str | None = None):
        key = (h3_cell, utc_date or utc_today(), name)
        entry = self._store.get(key)
        if entry is None:
            return None
        expires, value = entry
        if expires <= time.monotonic():
            del self._store[key]
            return None
        return value

    def set(self, h3_cell: str, name: str, value, ttl_seconds: float,
            utc_date: str | None = None) -> None:
        key = (h3_cell, utc_date or utc_today(), name)
        if key not in self._store and len(self._store) >= self.MAX_ENTRIES:
            now = time.monotonic()
            for k, (exp, _) in list(self._store.items()):
                if exp <= now:
                    del self._store[k]
            while len(self._store) >= self.MAX_ENTRIES:
                self._store.pop(next(iter(self._store)))  # oldest first
        self._store[key] = (time.monotonic() + ttl_seconds, value)


CACHE = TTLCache()
